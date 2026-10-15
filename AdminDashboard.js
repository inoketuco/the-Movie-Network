import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { glass, GUTTER, space, type } from './theme';
import { Badge, Banner, Button, Card, ScreenHeader } from './ui';

const formatDate = (value) => {
  if (!value?.toDate) return 'Never';
  return value.toDate().toLocaleString();
};

const AdminDashboard = ({ isDark = false }) => {
  const theme = glass(isDark);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const snapshot = await getDocs(collection(db, 'users'));
      const userList = snapshot.docs
        .map((userDoc) => ({ id: userDoc.id, ...userDoc.data() }))
        .sort((a, b) => (a.email || '').localeCompare(b.email || ''));
      setUsers(userList);
    } catch (error) {
      setErrorMessage(error.message || 'Could not load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.list}
      data={users}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <>
          <ScreenHeader
            title="Users"
            subtitle={`${users.length} registered ${users.length === 1 ? 'account' : 'accounts'}`}
            right={<Button title="Refresh" variant="secondary" size="sm" onPress={loadUsers} disabled={loading} />}
          />
          {loading ? <ActivityIndicator size="large" color={theme.primary} style={styles.loading} /> : null}
          {errorMessage ? <Banner tone="error" message={errorMessage} style={styles.banner} /> : null}
        </>
      }
      ListEmptyComponent={
        !loading && !errorMessage ? <Text style={[type.bodySmall, { color: theme.textSecondary }]}>No users found.</Text> : null
      }
      renderItem={({ item }) => (
        <Card style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={[type.cardTitle, styles.email, { color: theme.text }]} numberOfLines={1}>
              {item.email || 'No email'}
            </Text>
            <Badge label={item.role === 'admin' ? 'Admin' : 'User'} tone={item.role === 'admin' ? 'primary' : 'neutral'} />
          </View>
          {item.nickname ? <Text style={[type.bodySmall, { color: theme.textSecondary }]}>Nickname: {item.nickname}</Text> : null}
          <Text style={[type.caption, styles.lastVisit, { color: theme.textTertiary }]}>Last visit: {formatDate(item.lastVisited)}</Text>
        </Card>
      )}
    />
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: GUTTER, paddingTop: space.xl, paddingBottom: space.xxxl },
  loading: { marginVertical: space.xl },
  banner: { marginBottom: space.lg },
  card: { marginBottom: space.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  email: { flex: 1, marginRight: space.md },
  lastVisit: { marginTop: space.xs },
});

export default AdminDashboard;
