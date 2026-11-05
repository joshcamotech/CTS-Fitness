import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, SectionList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';

import { ColorTokens } from '../theme/colorways';
import { useTheme } from '../theme/ThemeContext';
import { FONT, RADIUS } from '../constants/theme';
import { Friendship, Profile } from '../types';
import { friendsApi, profileApi } from '../services/social';
import { PressableScale } from '../components/PressableScale';
import { Avatar } from '../components/Avatar';
import { useContentActions } from '../components/ContentActions';
import { haptics } from '../utils/haptics';

type SearchSection = { key: 'search'; title: string; data: Profile[] };
type FriendSection = { key: 'requests' | 'friends' | 'sent'; title: string; data: Friendship[] };

export function FriendsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query,       setQuery]       = useState('');
  const [results,     setResults]     = useState<Profile[]>([]);
  const [searching,   setSearching]   = useState(false);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [pendingIds,  setPendingIds]  = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setFriendships(await friendsApi.list());
    } catch (e) {
      Alert.alert('Error', (e as Error).message ?? 'Failed to load friends');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // block_user() deletes the friendship or pending request as well, so
  // reload rather than patching the list; the blocked user also drops
  // out of search, which RLS now hides them from.
  const { openMenu, reportSheet } = useContentActions({
    onBlocked: userId => {
      setResults(prev => prev.filter(p => p.id !== userId));
      load();
    },
  });

  // Debounced username search. latestQueryRef guards against an older,
  // slower response landing after a newer one and overwriting its results.
  const latestQueryRef = useRef('');
  useEffect(() => {
    const q = query.trim();
    latestQueryRef.current = q;
    if (!q) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      profileApi.search(q)
        .then(r => { if (latestQueryRef.current === q) setResults(r); })
        .catch(() => { if (latestQueryRef.current === q) setResults([]); })
        .finally(() => { if (latestQueryRef.current === q) setSearching(false); });
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const withPending = async (id: string, fn: () => Promise<void>) => {
    setPendingIds(prev => new Set(prev).add(id));
    try {
      await fn();
    } finally {
      setPendingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const sendRequest = (profile: Profile) => withPending(profile.id, async () => {
    if (!profile.username) return;
    haptics.tap();
    try {
      const { status } = await friendsApi.sendRequest(profile.username);
      haptics.success();
      if (status === 'accepted') Alert.alert('Friends!', `You and ${profile.username} are now friends.`);
      setQuery('');
      setResults([]);
      load();
    } catch (e) {
      haptics.warning();
      Alert.alert('Could not send request', (e as Error).message ?? 'Please try again.');
    }
  });

  const respond = (f: Friendship, accept: boolean) => withPending(String(f.id), async () => {
    haptics.tap();
    try {
      await friendsApi.respond(f.id, accept);
      haptics.success();
      load();
    } catch (e) {
      Alert.alert('Error', (e as Error).message ?? 'Please try again.');
    }
  });

  const cancelSent = (f: Friendship) => withPending(String(f.id), async () => {
    try {
      await friendsApi.remove(f.id);
      load();
    } catch (e) {
      Alert.alert('Error', (e as Error).message ?? 'Please try again.');
    }
  });

  const unfriend = (f: Friendship) => {
    haptics.warning();
    Alert.alert('Remove Friend', `Remove ${f.other_display_name || f.other_username} as a friend?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: () => withPending(String(f.id), async () => {
          try {
            await friendsApi.remove(f.id);
            load();
          } catch (e) {
            Alert.alert('Error', (e as Error).message ?? 'Please try again.');
          }
        }),
      },
    ]);
  };

  const incoming = friendships.filter(f => f.status === 'pending' && !f.is_requester);
  const accepted = friendships.filter(f => f.status === 'accepted');
  const sent     = friendships.filter(f => f.status === 'pending' && f.is_requester);

  const friendSections: FriendSection[] = [
    { key: 'requests', title: 'Requests', data: incoming },
    { key: 'friends',  title: 'Friends',  data: accepted },
    { key: 'sent',     title: 'Sent',     data: sent },
  ];

  const sections: (SearchSection | FriendSection)[] = query.trim()
    ? [{ key: 'search', title: 'Results', data: results }]
    : friendSections.filter(s => s.data.length > 0);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.searchWrap}>
        <Feather name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by username"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searching && <ActivityIndicator size="small" color={colors.primary} />}
      </View>

      <SectionList<Profile | Friendship, SearchSection | FriendSection>
        sections={sections}
        keyExtractor={(item, index) => ('id' in item ? String(item.id) : String(index))}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        renderItem={({ item, section }) => {
          if (section.key === 'search') {
            const profile = item as Profile;
            return (
              <View style={styles.row}>
                <Avatar name={profile.display_name || profile.username} size={40} />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{profile.display_name || profile.username}</Text>
                  <Text style={styles.rowSub}>@{profile.username}</Text>
                </View>
                <PressableScale
                  style={styles.addBtn}
                  onPress={() => sendRequest(profile)}
                  disabled={pendingIds.has(profile.id)}
                  pressScale={0.95}
                >
                  {pendingIds.has(profile.id)
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <Feather name="user-plus" size={15} color={colors.primary} />}
                </PressableScale>
                <TouchableOpacity
                  style={styles.menuBtn}
                  accessibilityLabel="User options"
                  onPress={() => openMenu({
                    kind:       'user',
                    userId:     profile.id,
                    authorId:   profile.id,
                    authorName: profile.username,
                  })}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Feather name="more-horizontal" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            );
          }

          const f = item as Friendship;
          const busy = pendingIds.has(String(f.id));
          return (
            <View style={styles.row}>
              <Avatar name={f.other_display_name || f.other_username} size={40} />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{f.other_display_name || f.other_username}</Text>
                <Text style={styles.rowSub}>@{f.other_username}</Text>
              </View>
              {section.key === 'requests' && (
                busy ? <ActivityIndicator size="small" color={colors.primary} /> : (
                  <View style={styles.requestActions}>
                    <TouchableOpacity style={styles.declineBtn} onPress={() => respond(f, false)}>
                      <Feather name="x" size={15} color={colors.danger} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.acceptBtn} onPress={() => respond(f, true)}>
                      <Feather name="check" size={15} color={colors.success} />
                    </TouchableOpacity>
                  </View>
                )
              )}
              {section.key === 'sent' && (
                busy ? <ActivityIndicator size="small" color={colors.textMuted} /> : (
                  <TouchableOpacity style={styles.pendingBtn} onPress={() => cancelSent(f)}>
                    <Text style={styles.pendingBtnText}>Pending</Text>
                  </TouchableOpacity>
                )
              )}
              {section.key === 'friends' && (
                busy ? <ActivityIndicator size="small" color={colors.textMuted} /> : (
                  <TouchableOpacity
                    style={styles.unfriendBtn}
                    onPress={() => unfriend(f)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Feather name="user-minus" size={15} color={colors.textMuted} />
                  </TouchableOpacity>
                )
              )}
              <TouchableOpacity
                style={styles.menuBtn}
                accessibilityLabel="User options"
                onPress={() => openMenu({
                  kind:       'user',
                  userId:     f.other_user_id,
                  authorId:   f.other_user_id,
                  authorName: f.other_username,
                })}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="more-horizontal" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          query.trim() && !searching ? (
            <Text style={styles.emptyText}>No users found for "{query.trim()}".</Text>
          ) : !query.trim() && sections.length === 0 ? (
            <Text style={styles.emptyText}>Search for a friend's username above to get started.</Text>
          ) : undefined
        }
      />
      {reportSheet}
    </SafeAreaView>
  );
}

const createStyles = (colors: ColorTokens) => StyleSheet.create({
  safe: {
    flex:            1,
    backgroundColor: colors.bg,
  },
  centred: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'center',
  },
  searchWrap: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    marginHorizontal:  16,
    marginTop:         12,
    marginBottom:      4,
    backgroundColor:   colors.card,
    borderRadius:      RADIUS.md,
    borderWidth:        1,
    borderColor:        colors.border,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex:            1,
    paddingVertical: 12,
    color:           colors.text,
    fontSize:        15,
  },
  listContent: {
    padding:       16,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontFamily:    FONT.semibold,
    fontSize:      12,
    color:         colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop:     16,
    marginBottom:   8,
  },
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               12,
    backgroundColor:   colors.card,
    borderRadius:      RADIUS.lg,
    padding:           12,
    marginBottom:      8,
    borderWidth:        1,
    borderColor:        colors.cardBorder,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: FONT.medium,
    fontSize:   15,
    color:      colors.text,
  },
  rowSub: {
    fontSize:  12,
    color:     colors.textMuted,
    marginTop:  2,
  },
  addBtn: {
    width:           34,
    height:          34,
    borderRadius:    RADIUS.pill,
    backgroundColor: colors.primaryBg,
    alignItems:      'center',
    justifyContent:  'center',
  },
  requestActions: {
    flexDirection: 'row',
    gap:           8,
  },
  acceptBtn: {
    width:           30,
    height:          30,
    borderRadius:    RADIUS.sm,
    backgroundColor: colors.successBg,
    alignItems:      'center',
    justifyContent:  'center',
  },
  declineBtn: {
    width:           30,
    height:          30,
    borderRadius:    RADIUS.sm,
    backgroundColor: colors.dangerBg,
    alignItems:      'center',
    justifyContent:  'center',
  },
  pendingBtn: {
    paddingHorizontal: 10,
    paddingVertical:    6,
    borderRadius:      RADIUS.pill,
    backgroundColor:   colors.bgAlt,
    borderWidth:        1,
    borderColor:        colors.border,
  },
  pendingBtnText: {
    fontFamily: FONT.medium,
    fontSize:   12,
    color:      colors.textMuted,
  },
  unfriendBtn: {
    width:           30,
    height:          30,
    alignItems:      'center',
    justifyContent:  'center',
  },
  menuBtn: {
    paddingLeft: 4,
  },
  emptyText: {
    fontSize:   13,
    color:      colors.textMuted,
    textAlign:  'center',
    marginTop:  32,
    lineHeight: 19,
  },
});
