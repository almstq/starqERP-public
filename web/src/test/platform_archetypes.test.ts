import { describe, expect, it } from 'vitest';
import { getArchetype, getArchetypeTerms, provisionArchetypeDefaults, ARCHETYPES } from '../domain/archetypes';

describe('SERP-288: Platform Archetype Decoupling & Tenant Customization', () => {
  it('supports materially different tenants from one shared catalog with industry-specific terminology', () => {
    const general = getArchetype('general_business');
    const software = getArchetype('software_services');
    const automotive = getArchetype('automotive_workshop');
    const marine = getArchetype('marine_service');

    expect(general.terminology.customer).toBe('Customer');
    expect(general.terminology.order).toBe('Work Order');
    expect(general.terminology.showVehicleFields).toBe(false);

    expect(software.terminology.customer).toBe('Client');
    expect(software.terminology.order).toBe('Project');
    expect(software.terminology.showVehicleFields).toBe(false);

    expect(automotive.terminology.customer).toBe('Customer');
    expect(automotive.terminology.order).toBe('Job Card');
    expect(automotive.terminology.showVehicleFields).toBe(true);

    expect(marine.terminology.customer).toBe('Vessel Owner / Client');
    expect(marine.terminology.order).toBe('Service Order');
    expect(marine.terminology.showVehicleFields).toBe(false);
  });

  it('proves Starq Technologies book and Ignition Ink book render distinct terminology from same core', () => {
    const starqTerms = getArchetypeTerms('general_business');
    const ignitionTerms = getArchetypeTerms('automotive_workshop');

    expect(starqTerms.activeOrdersHeader).toBe('Active Orders & Work In Progress');
    expect(starqTerms.showVehicleFields).toBe(false);

    expect(ignitionTerms.activeOrdersHeader).toBe('Active Work Orders & Floor Bays');
    expect(ignitionTerms.showVehicleFields).toBe(true);
  });

  it('contains canonical industry archetypes without per-client source code forks', () => {
    expect(Object.keys(ARCHETYPES)).toEqual(
      expect.arrayContaining([
        'general_business',
        'software_services',
        'automotive_workshop',
        'marine_service',
        'medical_clinic',
        'wholesale_trading',
        'construction_contracting',
        'retail',
      ])
    );
  });

  it('does not mutate the catalog when provisioning defaults', () => {
    const first = provisionArchetypeDefaults('retail', 'tenant-a');
    first.workflow[0].name = 'Changed locally';

    expect(getArchetype('retail').workflow[0].name).toBe('Sale Opened');
  });
});
