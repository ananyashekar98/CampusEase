import React from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { gatColors } from '../theme/theme';

// The cloud-upload icon in the dashboard's top bar (next to the settings /
// theme / notification icons). Renders ONLY for the main admin (an admin
// with no department) — for everyone else it renders nothing.
// Used as: <DashboardLayout extraHeaderIcon={<BulkImportHeaderIcon />} ... />
export default function BulkImportHeaderIcon() {
  const { user } = useAuth();
  const navigation = useNavigation();
  if (!user || user.role !== 'admin' || user.department) return null;

  return (
    <Pressable
      style={{ padding: 4 }}
      onPress={() => navigation.navigate('AdminBulkImport')}
      hitSlop={8}
      accessibilityLabel="Bulk import users from Excel"
    >
      <Ionicons name="cloud-upload-outline" size={20} color={gatColors.white} />
    </Pressable>
  );
}