import { Ionicons } from '@expo/vector-icons';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import AccountsScreen from '../screens/AccountsScreen';
import BillNewScreen from '../screens/BillNewScreen';
import CashReconciliationScreen from '../screens/CashReconciliationScreen';
import ClosedDaysScreen from '../screens/ClosedDaysScreen';
import CustomerEditScreen from '../screens/CustomerEditScreen';
import CustomersScreen from '../screens/CustomersScreen';
import CustomerStatementScreen from '../screens/CustomerStatementScreen';
import DeliveriesScreen from '../screens/DeliveriesScreen';
import DuesScreen from '../screens/DuesScreen';
import ExpenseEditScreen from '../screens/ExpenseEditScreen';
import ExpensesScreen from '../screens/ExpensesScreen';
import HomeScreen from '../screens/HomeScreen';
import LoginScreen from '../screens/LoginScreen';
import MenuItemEditScreen from '../screens/MenuItemEditScreen';
import MenuScreen from '../screens/MenuScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import OrderNewScreen from '../screens/OrderNewScreen';
import OrdersScreen from '../screens/OrdersScreen';
import PauseScreen from '../screens/PauseScreen';
import RoundsScreen from '../screens/RoundsScreen';
import StaffEditScreen from '../screens/StaffEditScreen';
import SubscriptionDetailScreen from '../screens/SubscriptionDetailScreen';
import SubscriptionEditScreen from '../screens/SubscriptionEditScreen';
import SubscriptionsScreen from '../screens/SubscriptionsScreen';
import TeamScreen from '../screens/TeamScreen';
import { colors } from '../theme';
import { Role } from '../types';
import { RootStackParamList } from './params';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.card,
    text: colors.text,
    primary: colors.primary,
    border: colors.border,
  },
};

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Home: 'home',
  Orders: 'receipt',
  Deliveries: 'bicycle',
  Packs: 'repeat',
  Accounts: 'cash',
  Customers: 'people',
  Menu: 'fast-food',
  Team: 'id-card',
};

function tabsForRole(role: Role): { name: string; component: React.ComponentType }[] {
  const home = { name: 'Home', component: HomeScreen };
  const orders = { name: 'Orders', component: OrdersScreen };
  const deliveries = { name: 'Deliveries', component: DeliveriesScreen };
  const plans = { name: 'Packs', component: SubscriptionsScreen };
  const accounts = { name: 'Accounts', component: AccountsScreen };
  const customers = { name: 'Customers', component: CustomersScreen };
  const menu = { name: 'Menu', component: MenuScreen };
  // Five tabs is the most that stays readable on a phone, so Team and Menu —
  // only touched occasionally — live behind links on the Home screen for the
  // owner. Money screens are limited to the owner and the accountant.
  switch (role) {
    case 'owner':
      return [home, orders, plans, accounts, customers];
    case 'dispatch':
      return [home, orders, plans, customers, menu];
    case 'rider':
      return [home, deliveries, customers];
    case 'accountant':
      return [home, orders, accounts, customers];
  }
}

function MainTabs() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.card },
        headerTitleStyle: { fontWeight: '800', color: colors.text },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name]} size={size} color={color} />
        ),
      })}
    >
      {tabsForRole(user.role).map((t) => (
        <Tab.Screen key={t.name} name={t.name} component={t.component} />
      ))}
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { user, ready } = useAuth();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {!user ? (
        <LoginScreen />
      ) : (
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.card },
            headerTitleStyle: { fontWeight: '800', color: colors.text },
            headerTintColor: colors.primary,
            headerShadowVisible: false,
          }}
        >
          <Stack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen
            name="CustomerEdit"
            component={CustomerEditScreen}
            options={({ route }) => ({ title: route.params?.id ? 'Edit Customer' : 'New Customer' })}
          />
          <Stack.Screen
            name="MenuItemEdit"
            component={MenuItemEditScreen}
            options={({ route }) => ({ title: route.params?.id ? 'Edit Menu Item' : 'New Menu Item' })}
          />
          <Stack.Screen
            name="StaffEdit"
            component={StaffEditScreen}
            options={({ route }) => ({ title: route.params?.id ? 'Edit Staff' : 'New Staff' })}
          />
          <Stack.Screen
            name="OrderNew"
            component={OrderNewScreen}
            options={({ route }) => ({ title: route.params?.orderId ? 'Edit Order' : 'New Order' })}
          />
          <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: 'Order' }} />
          <Stack.Screen
            name="SubscriptionEdit"
            component={SubscriptionEditScreen}
            options={({ route }) => ({
              title: route.params?.id ? 'Edit pack' : 'New pack',
            })}
          />
          <Stack.Screen
            name="SubscriptionDetail"
            component={SubscriptionDetailScreen}
            options={{ title: 'Pack' }}
          />
          <Stack.Screen name="Pause" component={PauseScreen} options={{ title: 'Away for a while' }} />
          <Stack.Screen name="Team" component={TeamScreen} options={{ title: 'Team' }} />
          <Stack.Screen name="Menu" component={MenuScreen} options={{ title: 'Menu' }} />
          <Stack.Screen name="Rounds" component={RoundsScreen} options={{ title: 'Delivery rounds' }} />
          <Stack.Screen
            name="ClosedDays"
            component={ClosedDaysScreen}
            options={{ title: 'Kitchen open days' }}
          />
          <Stack.Screen
            name="CashReconciliation"
            component={CashReconciliationScreen}
            options={{ title: 'Cash from riders' }}
          />
          <Stack.Screen name="Dues" component={DuesScreen} options={{ title: 'Customer accounts' }} />
          <Stack.Screen
            name="CustomerStatement"
            component={CustomerStatementScreen}
            options={{ title: 'Account' }}
          />
          <Stack.Screen name="BillNew" component={BillNewScreen} options={{ title: 'Raise a bill' }} />
          <Stack.Screen name="Expenses" component={ExpensesScreen} options={{ title: 'Expenses' }} />
          <Stack.Screen
            name="ExpenseEdit"
            component={ExpenseEditScreen}
            options={({ route }) => ({ title: route.params?.id ? 'Edit Expense' : 'New Expense' })}
          />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}
