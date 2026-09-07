-- -----------------------------------------------------------------------------
-- Migration 0027: Staff Invitations and Lifecycle Workflow (SERP-286)
-- -----------------------------------------------------------------------------
-- Enables self-service tenant staff invitations:
-- 1. Table public.invitations with 7-day token expiration, role, books, locations.
-- 2. Tenant isolation RLS policies on public.invitations.
-- 3. Stored procedure public.accept_staff_invitation to atomically activate membership.
-- -----------------------------------------------------------------------------

begin;

CREATE TABLE IF NOT EXISTS public.invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    role_id TEXT NOT NULL DEFAULT 'viewer',
    job_title TEXT,
    phone TEXT,
    book_ids UUID[] DEFAULT '{}',
    location_ids UUID[] DEFAULT '{}',
    token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked', 'cancelled')),
    invited_by UUID REFERENCES public.persons(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    accepted_at TIMESTAMPTZ,
    accepted_by UUID REFERENCES public.persons(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial index ensuring only one active pending invitation per email per organization
CREATE UNIQUE INDEX IF NOT EXISTS uq_invitation_org_email_pending
    ON public.invitations (organisation_id, lower(trim(email)))
    WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;

-- RLS Policy: Tenant isolation using canonical app_private.current_organisation_id()
CREATE POLICY invitations_tenant_isolation ON public.invitations
    FOR ALL
    USING (
        organisation_id = app_private.current_organisation_id()
    )
    WITH CHECK (
        organisation_id = app_private.current_organisation_id()
    );

-- Stored procedure to atomically accept an invitation on sign-in
CREATE OR REPLACE FUNCTION public.accept_staff_invitation(
    p_invitation_id UUID,
    p_person_id UUID,
    p_verified_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, platform, auth, extensions
AS $$
DECLARE
    v_inv RECORD;
    v_membership_id UUID;
    v_book_id UUID;
BEGIN
    -- 1. Lock and validate invitation
    SELECT * INTO v_inv
    FROM public.invitations
    WHERE id = p_invitation_id
      AND status = 'pending'
      AND expires_at > now()
      AND lower(trim(email)) = lower(trim(p_verified_email))
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'invitation_invalid_or_expired');
    END IF;

    -- 2. Upsert membership in the organization
    INSERT INTO public.memberships (
        organisation_id,
        person_id,
        role,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_inv.organisation_id,
        p_person_id,
        v_inv.role_id,
        'active',
        now(),
        now()
    )
    ON CONFLICT (organisation_id, person_id) DO UPDATE
    SET role = EXCLUDED.role,
        status = 'active',
        updated_at = now()
    RETURNING id INTO v_membership_id;

    -- 3. Upsert membership seat
    INSERT INTO public.membership_seats (
        membership_id,
        seat_code,
        created_at
    ) VALUES (
        v_membership_id,
        v_inv.role_id,
        now()
    )
    ON CONFLICT (membership_id, seat_code) DO NOTHING;

    -- 4. Attach book memberships if book_ids specified, otherwise attach default book
    IF array_length(v_inv.book_ids, 1) > 0 THEN
        FOREACH v_book_id IN ARRAY v_inv.book_ids LOOP
            INSERT INTO public.book_memberships (
                organisation_id,
                membership_id,
                book_id,
                created_at
            ) VALUES (
                v_inv.organisation_id,
                v_membership_id,
                v_book_id,
                now()
            )
            ON CONFLICT (organisation_id, membership_id, book_id) DO NOTHING;
        END LOOP;
    ELSE
        -- Attach default book
        SELECT id INTO v_book_id
        FROM public.books
        WHERE organisation_id = v_inv.organisation_id
          AND is_default = true
        LIMIT 1;

        IF v_book_id IS NOT NULL THEN
            INSERT INTO public.book_memberships (
                organisation_id,
                membership_id,
                book_id,
                created_at
            ) VALUES (
                v_inv.organisation_id,
                v_membership_id,
                v_book_id,
                now()
            )
            ON CONFLICT (organisation_id, membership_id, book_id) DO NOTHING;
        END IF;
    END IF;

    -- 5. Mark invitation as accepted
    UPDATE public.invitations
    SET status = 'accepted',
        accepted_at = now(),
        accepted_by = p_person_id,
        updated_at = now()
    WHERE id = v_inv.id;

    -- 6. Record immutable audit event
    INSERT INTO public.audit_events (
        organisation_id,
        person_id,
        event_type,
        details,
        occurred_at
    ) VALUES (
        v_inv.organisation_id,
        p_person_id,
        'invitation.accepted',
        jsonb_build_object(
            'invitation_id', v_inv.id,
            'email', v_inv.email,
            'role', v_inv.role_id,
            'membership_id', v_membership_id
        ),
        now()
    );

    RETURN jsonb_build_object(
        'ok', true,
        'organisation_id', v_inv.organisation_id,
        'membership_id', v_membership_id,
        'role', v_inv.role_id
    );
END;
$$;

commit;
