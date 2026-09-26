export type RootStackParamList = {
  Tabs: undefined;
  CustomerEdit: { id?: string };
  MenuItemEdit: { id?: string };
  StaffEdit: { id?: string };
  /** Pass `orderId` to edit an existing delivery instead of creating one. */
  OrderNew: { date?: string; roundId?: string; orderId?: string };
  Rounds: undefined;
  ClosedDays: undefined;
  OrderDetail: { id: string };
  SubscriptionEdit: { id?: string };
  SubscriptionDetail: { id: string };
  Pause: { subscriptionId: string };
  Team: undefined;
  Menu: undefined;
  CashReconciliation: undefined;
  Dues: undefined;
  CustomerStatement: { customerId: string };
  BillNew: { customerId: string };
  Expenses: undefined;
  ExpenseEdit: { id?: string };
};
