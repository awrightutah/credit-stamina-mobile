import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';

// Auth screens
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

// Main screens
import DashboardScreen from '../screens/DashboardScreen';
import AccountsScreen from '../screens/AccountsScreen';
import ActionsScreen from '../screens/ActionsScreen';
import LettersScreen from '../screens/LettersScreen';
import ScoreScreen from '../screens/ScoreScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AIAdvisorScreen from '../screens/AIAdvisorScreen';
import SettingsScreen from '../screens/SettingsScreen';

// New AI-powered screens
import UploadScreen from '../screens/UploadScreen';
import ActionPlanScreen from '../screens/ActionPlanScreen';
import BudgetScreen from '../screens/BudgetScreen';
import ScoreSimulatorScreen from '../screens/ScoreSimulatorScreen';
import ActivityScreen from '../screens/ActivityScreen';

// Colors
const COLORS = {
  primary: '#3B82F6',
  secondary: '#10B981',
  background: '#0F172A',
  card: '#1E293B',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  border: '#334155',
  danger: '#EF4444',
  warning: '#F59E0B',
  success: '#10B981',
};

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Tab icon component (placeholder - will use vector icons)
const TabIcon = ({ name, focused, color }) => {
  // For now, return null - will be replaced with actual icons
  return null;
};

// Main Tab Navigator
const MainTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.card,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          paddingTop: 8,
          paddingBottom: 8,
          height: 60,
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Home',
          // tabBarIcon: (props) => <TabIcon name="home" {...props} />,
        }}
      />
      <Tab.Screen 
        name="Accounts" 
        component={AccountsScreen}
        options={{
          tabBarLabel: 'Accounts',
        }}
      />
      <Tab.Screen 
        name="Actions" 
        component={ActionsScreen}
        options={{
          tabBarLabel: 'Actions',
        }}
      />
      <Tab.Screen 
        name="Score" 
        component={ScoreScreen}
        options={{
          tabBarLabel: 'Score',
        }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
        }}
      />
    </Tab.Navigator>
  );
};

// Auth Stack Navigator
const AuthStack = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
};

// Main App Navigator
const AppNavigator = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    // Return splash/loading screen
    return null;
  }

  return (
    <>
      {isAuthenticated ? (
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: COLORS.background },
          }}
        >
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="Letters" component={LettersScreen} />
          <Stack.Screen name="AIAdvisor" component={AIAdvisorScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          
          {/* New AI-powered screens */}
          <Stack.Screen name="Upload" component={UploadScreen} />
          <Stack.Screen name="ActionPlan" component={ActionPlanScreen} />
          <Stack.Screen name="Budget" component={BudgetScreen} />
          <Stack.Screen name="ScoreSimulator" component={ScoreSimulatorScreen} />
          <Stack.Screen name="Activity" component={ActivityScreen} />
        </Stack.Navigator>
      ) : (
        <AuthStack />
      )}
    </>
  );
};

export default AppNavigator;