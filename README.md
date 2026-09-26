# Tech-Triathlon 2026 - Logistics & Operations System

An end-to-end multi-role logistics management interface designed for high-efficiency warehouse and route operations. Built as part of the Tech-Triathlon 2026 competition.

---

## 🚀 Key Modules & System Workflow (Happy Path)

The platform connects 4 primary operational roles to enable real-time tracking, inventory handoff, and route execution:

1. **Store Manager Portal**
   * Manages daily stock orders and monitors strict 4:00 PM cutoff countdowns.
   * Enables clear separation between ambient and chilled/fresh goods.

2. **Dispatcher Dashboard**
   * Provides high-level operational metrics (Fleet Active, Fuel Quota, Deferral Alerts).
   * Feature-rich order dispatch table with single-click route allocation and status badges.

3. **Loader Dock App**
   * High-contrast interface optimized for rugged warehouse tablets and handhelds.
   * Real-time barcode scanning and loading sequence validation to prevent misplacement.

4. **Driver Route App**
   * Single-handed mobile UX designed for drivers on transit.
   * Integrates turn-by-turn navigation hierarchy and one-tap Proof of Delivery (POD) capture.

---

## 🎨 UI/UX Design Rationales

* **Color-Coded Status Badges:** Immediate visual feedback via high-contrast status tags (Allocated, Over Capacity, Pending) to streamline dispatcher decision-making.
* **Ergonomic Layouts:** Touch-friendly CTA placements for Loader and Driver interfaces, ensuring error-free operation in fast-paced physical environments.
* **Operational Efficiency:** Focus on the core happy-path flow to eliminate manual allocation delays and ensure seamless data handoffs across roles.

---

## 🔗 Interactive Prototype

Check out the interactive Figma prototype mapping the complete end-to-end workflow:
👉 **[Figma Interactive Prototype Link](ADD_YOUR_FIGMA_PROTOTYPE_LINK_HERE)**

---

## 📁 Repository Structure

```text
├── ui-designs/          # High-resolution screen captures
├── docs/                # Project documentation and demo assets
└── README.md            # Project overview and submission documentation
