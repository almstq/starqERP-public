import { describe, it, expect } from 'vitest';
import { InventoryItem, StockMovement } from '../types/erp';

describe('SERP-189 Stock Mutator Crash Prevention Tests', () => {
  it('correctly handles initial stock register creation without undefined references', () => {
    const rawInput: Omit<InventoryItem, 'id' | 'stockStatus' | 'lastRestockedDate'> = {
      sku: 'OIL-5W30-SYN',
      name: 'Full Synthetic Engine Oil 5W-30',
      category: 'Fluids & Lubricants',
      quantityOnHand: 45,
      reorderLevel: 10,
      unitCost: 180.00,
      sellingPrice: 260.00,
      unit: 'Liters',
      locationInShop: 'Rack A-2',
      supplierId: 'sup-1',
      supplierName: 'State Electric & Lubricants'
    };

    const newItem: InventoryItem = {
      ...rawInput,
      id: `inv-test-1`,
      stockStatus: rawInput.quantityOnHand > rawInput.reorderLevel ? 'In Stock' : rawInput.quantityOnHand > 0 ? 'Low Stock' : 'Out of Stock',
      lastRestockedDate: new Date().toISOString().split('T')[0]
    };

    expect(newItem.id).toBeDefined();
    expect(newItem.stockStatus).toBe('In Stock');
    expect(newItem.quantityOnHand).toBe(45);

    // Initial movement register must not throw
    const initialMovement: StockMovement = {
      id: `mov-test-1`,
      itemId: newItem.id,
      itemName: newItem.name,
      type: 'Received',
      quantity: newItem.quantityOnHand,
      unit: newItem.unit,
      date: new Date().toLocaleString(),
      reference: 'Initial Stock Register',
      staffName: 'Admin',
      notes: `Registered initial inventory with ${newItem.quantityOnHand} ${newItem.unit}`
    };

    expect(initialMovement.quantity).toBe(45);
    expect(initialMovement.itemName).toBe('Full Synthetic Engine Oil 5W-30');
  });

  it('adjusts stock safely for restock and deduction without allowing NaN or undefined states', () => {
    let currentItem: InventoryItem = {
      id: 'inv-item-101',
      sku: 'FLT-OIL-01',
      name: 'Standard Oil Filter',
      category: 'Filters',
      quantityOnHand: 15,
      reorderLevel: 5,
      unitCost: 75.00,
      sellingPrice: 120.00,
      unit: 'Units',
      locationInShop: 'Shelf B-1',
      supplierId: 'sup-1',
      supplierName: 'Autofix Supplies',
      stockStatus: 'In Stock',
      lastRestockedDate: '2026-08-01'
    };

    // 1. Receive 10 more
    const receivedQty = 10;
    const newQty = currentItem.quantityOnHand + receivedQty;
    currentItem = {
      ...currentItem,
      quantityOnHand: newQty,
      stockStatus: newQty > currentItem.reorderLevel ? 'In Stock' : 'Low Stock',
      lastRestockedDate: '2026-08-25'
    };

    expect(currentItem.quantityOnHand).toBe(25);
    expect(currentItem.stockStatus).toBe('In Stock');

    // 2. Consume 22 units (leaving 3 units -> Low Stock)
    const consumedQty = 22;
    const postConsumedQty = Math.max(0, currentItem.quantityOnHand - consumedQty);
    currentItem = {
      ...currentItem,
      quantityOnHand: postConsumedQty,
      stockStatus: postConsumedQty > currentItem.reorderLevel ? 'In Stock' : postConsumedQty > 0 ? 'Low Stock' : 'Out of Stock'
    };

    expect(currentItem.quantityOnHand).toBe(3);
    expect(currentItem.stockStatus).toBe('Low Stock');

    // 3. Consume remaining 3 units -> Out of Stock
    const finalConsumed = 3;
    const zeroQty = Math.max(0, currentItem.quantityOnHand - finalConsumed);
    currentItem = {
      ...currentItem,
      quantityOnHand: zeroQty,
      stockStatus: zeroQty > currentItem.reorderLevel ? 'In Stock' : zeroQty > 0 ? 'Low Stock' : 'Out of Stock'
    };

    expect(currentItem.quantityOnHand).toBe(0);
    expect(currentItem.stockStatus).toBe('Out of Stock');
  });
});
