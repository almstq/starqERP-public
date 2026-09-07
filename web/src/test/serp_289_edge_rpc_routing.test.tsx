import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import { ERPProvider, useERP } from "../context/ERPContext";
import * as apiGateway from "../services/apiGateway";

describe("SERP-289: Pure Edge RPC Routing & Authoritative Rollback on Rejection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("routes createInvoice through Edge RPC dispatchCommand and confirms server document_no", async () => {
    const dispatchSpy = vi.spyOn(apiGateway, "dispatchCommand").mockResolvedValueOnce({
      ok: true,
      invoice: {
        invoice_id: "inv-server-uuid-1",
        invoice_number: "INV-2026-SRV-999",
        total_amount: 1080,
      },
    } as any);

    let erpRef: ReturnType<typeof useERP> = null as any;

    const TestHarness = () => {
      erpRef = useERP();
      return (
        <div>
          <div data-testid="pending">{erpRef.mutationPending ? "PENDING" : "IDLE"}</div>
          <div data-testid="invoices-count">{erpRef.invoices.length}</div>
          <div data-testid="latest-no">{erpRef.invoices[0]?.invoiceNumber ?? ""}</div>
          <button
            data-testid="create-btn"
            onClick={() => {
              erpRef.createInvoice({
                customerId: "cust-1",
                customerName: "Island Express",
                customerPhone: "+960 777-1234",
                customerIsland: "Male'",
                date: "2026-09-05",
                dueDate: "2026-09-19",
                items: [
                  {
                    id: "it-1",
                    description: "Diagnostics Service",
                    quantity: 1,
                    unitPrice: 1000,
                    amount: 1000,
                    category: "Labor/Service",
                  },
                ],
                subtotal: 1000,
                gstRate: 0.08,
                gstAmount: 80,
                totalAmount: 1080,
                amountPaid: 0,
                balanceDue: 1080,
                status: "Sent",
                bankDetails: "BML 773000",
              });
            }}
          >
            Create
          </button>
        </div>
      );
    };

    render(
      <ERPProvider>
        <TestHarness />
      </ERPProvider>
    );

    expect(screen.getByTestId("invoices-count").textContent).toBe("0");

    await act(async () => {
      screen.getByTestId("create-btn").click();
    });

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith({
      command: "INVOICE",
      payload: expect.objectContaining({
        customer_id: "cust-1",
        total_amount: 1080,
        subtotal: 1000,
        gst_amount: 80,
      }),
    });

    // Server-assigned document number replaces optimistic temporary ID
    expect(screen.getByTestId("invoices-count").textContent).toBe("1");
    expect(screen.getByTestId("latest-no").textContent).toBe("INV-2026-SRV-999");
    expect(screen.getByTestId("pending").textContent).toBe("IDLE");
  });

  it("rolls back optimistic invoice and customer balance upon server Edge RPC rejection", async () => {
    const dispatchSpy = vi.spyOn(apiGateway, "dispatchCommand").mockRejectedValueOnce(
      new apiGateway.ApiError(403, "seat_not_authorized")
    );

    let erpRef: ReturnType<typeof useERP> = null as any;

    const TestHarness = () => {
      erpRef = useERP();
      return (
        <div>
          <div data-testid="pending">{erpRef.mutationPending ? "PENDING" : "IDLE"}</div>
          <div data-testid="invoices-count">{erpRef.invoices.length}</div>
          <div data-testid="error-msg">{erpRef.lastMutationError ?? ""}</div>
          <button
            data-testid="create-fail-btn"
            onClick={() => {
              erpRef.createInvoice({
                customerId: "cust-fail",
                customerName: "Fail Test Fleet",
                customerPhone: "+960 777-9999",
                customerIsland: "Hulhumale'",
                date: "2026-09-05",
                dueDate: "2026-09-19",
                items: [],
                subtotal: 500,
                gstRate: 0.08,
                gstAmount: 40,
                totalAmount: 540,
                amountPaid: 0,
                balanceDue: 540,
                status: "Sent",
                bankDetails: "",
              });
            }}
          >
            Create
          </button>
        </div>
      );
    };

    render(
      <ERPProvider>
        <TestHarness />
      </ERPProvider>
    );

    await act(async () => {
      screen.getByTestId("create-fail-btn").click();
    });

    expect(dispatchSpy).toHaveBeenCalledTimes(1);

    // Assert that the invoice was rolled back and eliminated from state
    expect(screen.getByTestId("invoices-count").textContent).toBe("0");
    expect(screen.getByTestId("error-msg").textContent).toContain("API error 403: seat_not_authorized");
    expect(screen.getByTestId("pending").textContent).toBe("IDLE");
  });

  it("rolls back recordPayment upon server rejection without corrupting invoice balance", async () => {
    const dispatchSpy = vi.spyOn(apiGateway, "dispatchCommand").mockRejectedValueOnce(
      new apiGateway.ApiError(400, "overpayment_rejected")
    );

    let erpRef: ReturnType<typeof useERP> = null as any;

    const TestHarness = () => {
      erpRef = useERP();
      return (
        <div>
          <div data-testid="payments-count">{erpRef.payments.length}</div>
          <div data-testid="error-msg">{erpRef.lastMutationError ?? ""}</div>
          <button
            data-testid="pay-fail-btn"
            onClick={() => {
              erpRef.recordPayment({
                invoiceId: "inv-test-1",
                invoiceNumber: "INV-2026-001",
                customerId: "cust-1",
                customerName: "Customer A",
                amount: 999999,
                paymentDate: "2026-09-05",
                method: "BML Bank Transfer",
                referenceNumber: "REF-REJECT",
                bankAccount: "BML 773000",
                status: "Pending Reconciliation",
              });
            }}
          >
            Pay
          </button>
        </div>
      );
    };

    render(
      <ERPProvider>
        <TestHarness />
      </ERPProvider>
    );

    await act(async () => {
      screen.getByTestId("pay-fail-btn").click();
    });

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith({
      command: "INVOICE_PAYMENT",
      payload: expect.objectContaining({
        invoice_id: "inv-test-1",
        amount: 999999,
      }),
    });

    // Payment was not retained
    expect(screen.getByTestId("payments-count").textContent).toBe("0");
    expect(screen.getByTestId("error-msg").textContent).toContain("overpayment_rejected");
  });
});
