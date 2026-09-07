import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { ERPProvider } from "../context/ERPContext";
import { ThemeProvider } from "../context/ThemeContext";
import { AppShell } from "../app/AppShell";
import * as authService from "../services/auth";
import type { UserSession } from "../services/auth";

describe("SERP-404: Check Approval Status Real-Time Refresh & Transition", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("transitions from PendingApprovalView into operational tenant when approval status updates to approved", async () => {
    const initialApplicantSession: UserSession = {
      person_id: "applicant-1",
      name: "Al Starque",
      email: "al.starque@gmail.com",
      seats: [],
      acting_as: "",
      seat_label: "",
      csrf: "csrf-token-111",
      allowed_entities: [],
      organisations: [],
      platform_entitlement: null,
      application: {
        id: "app-999",
        status: "pending",
        name: "Al Starque Workshop",
        legal_name: "Al Starque Enterprises Pvt Ltd",
        created_at: new Date().toISOString(),
      },
    };

    const approvedSession: UserSession = {
      ...initialApplicantSession,
      current_organisation_id: "org-prov-100",
      current_book_id: "book-prov-100",
      seats: ["managing_director"],
      acting_as: "managing_director",
      seat_label: "Managing Director",
      allowed_entities: ["al-starque-workshop"],
      organisations: [
        {
          id: "org-prov-100",
          slug: "al-starque-workshop",
          name: "Al Starque Enterprises Pvt Ltd",
          books: [
            {
              id: "book-prov-100",
              code: "MAIN",
              name: "Main Operating Book",
              is_default: true,
              archetype_id: "automotive_workshop",
            },
          ],
        },
      ],
      application: {
        id: "app-999",
        status: "approved",
        name: "Al Starque Workshop",
        legal_name: "Al Starque Enterprises Pvt Ltd",
        created_at: new Date().toISOString(),
        provisioned_organisation_id: "org-prov-100",
      },
    };

    let callCount = 0;
    vi.spyOn(authService, "fetchCurrentUser").mockImplementation(async () => {
      callCount++;
      return callCount === 1 ? initialApplicantSession : approvedSession;
    });

    render(
      <MemoryRouter>
        <ThemeProvider>
          <AuthProvider>
            <ERPProvider>
              <AppShell />
            </ERPProvider>
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    // Initial state: PendingApprovalView is displayed
    await waitFor(() => {
      expect(screen.getByText(/Organisation Under Review/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Al Starque Workshop/i)).toBeInTheDocument();
    expect(screen.getByText(/Pending Starq HQ Review/i)).toBeInTheDocument();

    // Click "Check Approval Status"
    const checkStatusBtn = screen.getByRole("button", { name: /Check Approval Status/i });
    fireEvent.click(checkStatusBtn);

    // Upon refresh, session transitions to approved tenant without sign out/sign in
    await waitFor(() => {
      // PendingApprovalView is unmounted
      expect(screen.queryByText(/Organisation Under Review/i)).not.toBeInTheDocument();
      // Operational navigation rail / workspace elements mount
      expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText(/Al Starque/i).length).toBeGreaterThan(0);
  });

  it("displays decline reason when application is rejected upon clicking Check Approval Status", async () => {
    const initialApplicantSession: UserSession = {
      person_id: "applicant-2",
      name: "Hassan",
      email: "hassan@example.com",
      seats: [],
      acting_as: "",
      seat_label: "",
      csrf: "csrf-token-222",
      allowed_entities: [],
      organisations: [],
      platform_entitlement: null,
      application: {
        id: "app-888",
        status: "pending",
        name: "Hassan Spares",
        legal_name: "Hassan Spares LLC",
        created_at: new Date().toISOString(),
      },
    };

    const rejectedSession: UserSession = {
      ...initialApplicantSession,
      application: {
        id: "app-888",
        status: "rejected",
        name: "Hassan Spares",
        legal_name: "Hassan Spares LLC",
        created_at: new Date().toISOString(),
        rejection_reason: "Corporate registration documents unverified by Ministry",
      },
    };

    let callCount = 0;
    vi.spyOn(authService, "fetchCurrentUser").mockImplementation(async () => {
      callCount++;
      return callCount === 1 ? initialApplicantSession : rejectedSession;
    });

    render(
      <MemoryRouter>
        <ThemeProvider>
          <AuthProvider>
            <ERPProvider>
              <AppShell />
            </ERPProvider>
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Organisation Under Review/i)).toBeInTheDocument();
    });

    const checkStatusBtn = screen.getByRole("button", { name: /Check Approval Status/i });
    fireEvent.click(checkStatusBtn);

    await waitFor(() => {
      expect(screen.getByText(/Application Declined/i)).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Decline reason: Corporate registration documents unverified by Ministry/i)
    ).toBeInTheDocument();
  });

  it("displays information request note when operator requests info", async () => {
    const initialApplicantSession: UserSession = {
      person_id: "applicant-3",
      name: "Maryam",
      email: "maryam@example.com",
      seats: [],
      acting_as: "",
      seat_label: "",
      csrf: "csrf-token-333",
      allowed_entities: [],
      organisations: [],
      platform_entitlement: null,
      application: {
        id: "app-777",
        status: "pending",
        name: "Maryam Marine",
        legal_name: "Maryam Marine Solutions",
        created_at: new Date().toISOString(),
      },
    };

    const infoRequestedSession: UserSession = {
      ...initialApplicantSession,
      application: {
        id: "app-777",
        status: "info_requested",
        name: "Maryam Marine",
        legal_name: "Maryam Marine Solutions",
        created_at: new Date().toISOString(),
        info_request_note: "Please provide MIRA GST certificate copy",
      },
    };

    let callCount = 0;
    vi.spyOn(authService, "fetchCurrentUser").mockImplementation(async () => {
      callCount++;
      return callCount === 1 ? initialApplicantSession : infoRequestedSession;
    });

    render(
      <MemoryRouter>
        <ThemeProvider>
          <AuthProvider>
            <ERPProvider>
              <AppShell />
            </ERPProvider>
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Organisation Under Review/i)).toBeInTheDocument();
    });

    const checkStatusBtn = screen.getByRole("button", { name: /Check Approval Status/i });
    fireEvent.click(checkStatusBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/Information Requested/i).length).toBeGreaterThan(0);
    });
    expect(
      screen.getByText(/Information requested: Please provide MIRA GST certificate copy/i)
    ).toBeInTheDocument();
  });
});
