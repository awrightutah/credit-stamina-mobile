import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { householdAPI } from '../services/api';

const COLORS = {
  background:    '#0F172A',
  card:          '#1E293B',
  surface:       '#1E293B',
  text:          '#F1F5F9',
  textSecondary: '#64748B',
  border:        '#374151',
  purple:        '#7C3AED',
  primary:       '#1E40AF',
  success:       '#059669',
  warning:       '#F97316',
  danger:        '#DC2626',
};

const TOTAL_SEATS    = 2;
const INVITE_TTL_HRS = 48; // matches backend — invites expire after 48 hours

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatDate = (str) => {
  if (!str) return '';
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Returns "Expires in Xh Ym" or "Expired" for a pending invite
const getExpiryLabel = (expiresAt) => {
  if (!expiresAt) return null;
  const now = new Date();
  const exp = new Date(expiresAt);
  if (exp <= now) return 'Expired';
  const diffMs = exp - now;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins  = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 24) return `Expires in ${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0)   return `Expires in ${hours}h ${mins}m`;
  return `Expires in ${mins}m`;
};

// Client-side expiry check — treat pending invites whose expires_at has passed as expired
const resolveStatus = (invite) => {
  if (invite.status === 'pending' && invite.expires_at) {
    if (new Date(invite.expires_at) <= new Date()) return 'expired';
  }
  return invite.status;
};

const STATUS_META = {
  pending:   { label: 'Pending',   color: COLORS.warning },
  accepted:  { label: 'Accepted',  color: COLORS.success },
  expired:   { label: 'Expired',   color: COLORS.textSecondary },
  cancelled: { label: 'Cancelled', color: COLORS.danger },
};

// ─── Seat dot ─────────────────────────────────────────────────────────────────
const SeatDot = ({ filled, label }) => (
  <View style={styles.seatItem}>
    <View style={[styles.seatDot, filled ? styles.seatDotFilled : styles.seatDotEmpty]}>
      <Text style={styles.seatDotIcon}>{filled ? '👤' : '+'}</Text>
    </View>
    <Text style={styles.seatLabel}>{label}</Text>
  </View>
);

// ─── Invite row ───────────────────────────────────────────────────────────────
const InviteRow = ({ invite, onCancel, last }) => {
  const resolved  = resolveStatus(invite);
  const meta      = STATUS_META[resolved] ?? { label: resolved, color: COLORS.textSecondary };
  const canCancel = resolved === 'pending';
  const expiryLabel = resolved === 'pending' ? getExpiryLabel(invite.expires_at) : null;
  const expiryColor = expiryLabel?.startsWith('Expires in') && parseInt(expiryLabel.match(/\d+/)?.[0]) <= 4
    ? COLORS.danger
    : COLORS.textSecondary;

  return (
    <View style={[styles.inviteRow, !last && styles.rowBorder]}>
      <View style={styles.inviteLeft}>
        <Text style={styles.inviteEmail} numberOfLines={1}>{invite.invite_email}</Text>
        <View style={styles.inviteMeta}>
          <View style={[styles.statusBadge, { backgroundColor: meta.color + '20' }]}>
            <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          {invite.created_at && (
            <Text style={styles.inviteDate}>Sent {formatDate(invite.created_at)}</Text>
          )}
          {expiryLabel && (
            <Text style={[styles.inviteDate, { color: expiryColor }]}>{expiryLabel}</Text>
          )}
        </View>
      </View>
      {canCancel && (
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => onCancel(invite)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.cancelBtnText}>Revoke</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
const FamilyScreen = () => {
  const navigation = useNavigation();

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending]       = useState(false);
  const [error, setError]           = useState(null);

  const [profile, setProfile]       = useState(null);
  const [invites, setInvites]       = useState([]);
  const [email, setEmail]           = useState('');
  const [emailError, setEmailError] = useState('');

  // ── Security checks ────────────────────────────────────────────────────────
  // is_primary_user must be explicitly true OR unset (no household yet).
  // If explicitly false → invited/secondary user → cannot send invites.
  const isPrimary       = profile?.is_primary_user !== false;
  const isSecondaryUser = profile?.is_primary_user === false;
  const canInvite       = profile?.can_invite_household !== false;

  // Process invites: apply client-side expiry resolution
  const processedInvites = invites.map(inv => ({ ...inv, _resolved: resolveStatus(inv) }));

  const acceptedCount     = processedInvites.filter(i => i._resolved === 'accepted').length;
  const activePendingCount = processedInvites.filter(i => i._resolved === 'pending').length;
  const seatsUsed         = 1 + acceptedCount;
  const seatsLeft         = Math.max(0, TOTAL_SEATS - seatsUsed);

  // Can send: primary user, seats available, no active (non-expired) pending invite
  const canSendMore = isPrimary && canInvite && seatsLeft > 0 && activePendingCount === 0;

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [profileRes, invitesRes] = await Promise.all([
        householdAPI.getStatus().catch(() => null),
        householdAPI.getInvites().catch(() => ({ data: [] })),
      ]);

      const p = profileRes?.data ?? profileRes ?? {};
      setProfile(p);

      const raw = invitesRes?.data ?? invitesRes ?? [];
      setInvites(Array.isArray(raw) ? raw : []);
    } catch (err) {
      console.error('[Family] load error:', err);
      setError('Failed to load household data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, []);

  // Tick every 60 seconds to refresh expiry countdown labels on pending invites
  const [, setTick] = useState(0);
  useEffect(() => {
    const hasPending = invites.some(i => i.status === 'pending' && i.expires_at);
    if (!hasPending) return;
    const interval = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(interval);
  }, [invites]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  // ── Send invite ────────────────────────────────────────────────────────────
  const handleSendInvite = async () => {
    // Hard block — secondary users must never reach this
    if (!isPrimary || isSecondaryUser) {
      Alert.alert('Not Allowed', 'Only the primary account holder can send family invites.');
      return;
    }
    if (!canInvite) {
      Alert.alert('Not Available', 'Household invites are not enabled on your plan.');
      return;
    }
    if (seatsLeft === 0) {
      Alert.alert('Seats Full', 'Both household seats are already filled.');
      return;
    }
    if (activePendingCount > 0) {
      Alert.alert('Pending Invite', 'You already have a pending invite. Revoke it first to send a new one.');
      return;
    }

    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setEmailError('Enter an email address.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setEmailError('');
    setSending(true);

    try {
      await householdAPI.sendInvite(trimmed);
      setEmail('');
      Alert.alert(
        'Invite Sent! 📧',
        `An invitation has been sent to ${trimmed}. The link expires in ${INVITE_TTL_HRS} hours and can only be used once.`
      );
      loadData();
    } catch (err) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Failed to send invite.';
      Alert.alert('Could Not Send Invite', msg);
    } finally {
      setSending(false);
    }
  };

  // ── Revoke invite ──────────────────────────────────────────────────────────
  const handleCancelInvite = (invite) => {
    if (!isPrimary) {
      Alert.alert('Not Allowed', 'Only the primary account holder can revoke invites.');
      return;
    }
    Alert.alert(
      'Revoke Invite',
      `Remove the pending invite for ${invite.invite_email}? They will no longer be able to use this invite.`,
      [
        { text: 'Keep Invite', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              await householdAPI.cancelInvite(invite.id);
              setInvites(prev => prev.filter(i => i.id !== invite.id));
            } catch {
              Alert.alert('Error', 'Could not revoke the invite. Please try again.');
            }
          },
        },
      ]
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backBtn}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Family Plan</Text>
        <View style={{ width: 50 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.purple} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.purple} />
            }
          >
            {/* ── Seat counter card ── */}
            <View style={styles.seatsCard}>
              <View style={styles.seatsTitleRow}>
                <Text style={styles.seatsTitle}>👨‍👩‍👧 Household Seats</Text>
                <View style={[
                  styles.seatsBadge,
                  seatsLeft === 0 ? styles.seatsBadgeFull : styles.seatsBadgeAvail,
                ]}>
                  <Text style={[
                    styles.seatsBadgeText,
                    { color: seatsLeft === 0 ? COLORS.warning : COLORS.success },
                  ]}>
                    {seatsUsed}/{TOTAL_SEATS} used
                  </Text>
                </View>
              </View>
              <Text style={styles.seatsSubtitle}>
                Your plan includes <Text style={styles.seatsHighlight}>{TOTAL_SEATS} users</Text> at no extra cost
              </Text>

              {/* Seat dots */}
              <View style={styles.seatsRow}>
                <SeatDot filled label={isPrimary ? 'You (Primary)' : 'Primary'} />
                {Array.from({ length: TOTAL_SEATS - 1 }).map((_, i) => {
                  const accepted = processedInvites.filter(v => v._resolved === 'accepted');
                  const isFilled = i < accepted.length;
                  const label    = isFilled
                    ? (accepted[i].invite_email?.split('@')[0] ?? 'Member')
                    : 'Open';
                  return <SeatDot key={i} filled={isFilled} label={label} />;
                })}
              </View>

              {/* Seat progress bar */}
              <View style={styles.seatProgressTrack}>
                <View style={[
                  styles.seatProgressFill,
                  {
                    width: `${(seatsUsed / TOTAL_SEATS) * 100}%`,
                    backgroundColor: seatsLeft === 0 ? COLORS.warning : COLORS.success,
                  },
                ]} />
              </View>
              <Text style={styles.seatProgressLabel}>
                {seatsLeft > 0
                  ? `${seatsLeft} seat${seatsLeft > 1 ? 's' : ''} available`
                  : 'All seats filled'}
              </Text>
            </View>

            {/* ── SECONDARY USER VIEW — no invite access ── */}
            {isSecondaryUser && (
              <>
                <View style={styles.secondaryCard}>
                  <Text style={styles.secondaryIcon}>✅</Text>
                  <Text style={styles.secondaryTitle}>You're on a Shared Plan</Text>
                  <Text style={styles.secondaryBody}>
                    You joined Credit Stamina through a family invite. You have your own private account — your credit data, disputes, letters, and scores are visible only to you.
                  </Text>
                </View>

                {/* Explicit restriction notice */}
                <View style={styles.restrictionCard}>
                  <Text style={styles.restrictionIcon}>🔒</Text>
                  <View style={styles.restrictionBody}>
                    <Text style={styles.restrictionTitle}>Invites are Restricted</Text>
                    <Text style={styles.restrictionText}>
                      Family invites can only be sent by the primary account holder. You cannot invite additional members or share this plan with others.
                    </Text>
                  </View>
                </View>
              </>
            )}

            {/* ── PRIMARY USER — invite section ── */}
            {isPrimary && canInvite && (
              <>
                {/* How it works */}
                <View style={styles.howCard}>
                  <Text style={styles.howTitle}>How It Works</Text>
                  <View style={styles.stepRow}>
                    <View style={styles.stepBubble}><Text style={styles.stepNum}>1</Text></View>
                    <Text style={styles.stepText}>Enter your family member's email below</Text>
                  </View>
                  <View style={styles.stepRow}>
                    <View style={styles.stepBubble}><Text style={styles.stepNum}>2</Text></View>
                    <Text style={styles.stepText}>They receive a sign-up link — valid for {INVITE_TTL_HRS} hours, one-time use only</Text>
                  </View>
                  <View style={styles.stepRow}>
                    <View style={styles.stepBubble}><Text style={styles.stepNum}>3</Text></View>
                    <Text style={styles.stepText}>They create their own account — private data, shared plan</Text>
                  </View>
                </View>

                {/* Invite form */}
                <View style={styles.inviteFormCard}>
                  <Text style={styles.inviteFormTitle}>
                    {canSendMore
                      ? 'Invite a Family Member'
                      : seatsLeft === 0
                      ? '🔒 All Seats Filled'
                      : '⏳ Invite Pending'}
                  </Text>

                  {canSendMore ? (
                    <>
                      <Text style={styles.inviteFormSubtitle}>
                        The invite link expires in {INVITE_TTL_HRS} hours and can only be used once.
                      </Text>
                      <View style={styles.inputRow}>
                        <TextInput
                          style={[styles.emailInput, !!emailError && styles.emailInputError]}
                          placeholder="partner@email.com"
                          placeholderTextColor={COLORS.textSecondary}
                          value={email}
                          onChangeText={(t) => { setEmail(t); setEmailError(''); }}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                          autoComplete="email"
                          returnKeyType="send"
                          onSubmitEditing={handleSendInvite}
                          editable={!sending}
                        />
                        <TouchableOpacity
                          style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
                          onPress={handleSendInvite}
                          disabled={sending}
                          activeOpacity={0.75}
                        >
                          {sending
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Text style={styles.sendBtnText}>Send</Text>
                          }
                        </TouchableOpacity>
                      </View>
                      {!!emailError && <Text style={styles.emailErrorText}>{emailError}</Text>}
                    </>
                  ) : seatsLeft === 0 ? (
                    <Text style={styles.seatFullText}>
                      Both household seats are filled. To invite someone new, the current member must leave or be removed.
                    </Text>
                  ) : activePendingCount > 0 ? (
                    <Text style={styles.seatFullText}>
                      You have an active pending invite below. Revoke it first to send a new one, or wait for it to expire ({INVITE_TTL_HRS}h limit).
                    </Text>
                  ) : null}
                </View>

                {/* Invite history */}
                {processedInvites.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Invite History</Text>
                    <View style={styles.inviteListCard}>
                      {processedInvites.map((invite, i) => (
                        <InviteRow
                          key={invite.id ?? `inv-${i}`}
                          invite={invite}
                          onCancel={handleCancelInvite}
                          last={i === processedInvites.length - 1}
                        />
                      ))}
                    </View>
                  </View>
                )}

                {processedInvites.length === 0 && (
                  <View style={styles.emptyInvites}>
                    <Text style={styles.emptyInvitesText}>No invites sent yet.</Text>
                  </View>
                )}
              </>
            )}

            {/* ── Plan doesn't include invites ── */}
            {isPrimary && !canInvite && (
              <View style={styles.disabledCard}>
                <Text style={styles.disabledText}>
                  Household invites are not available on your current plan. Upgrade to Credit Stamina Pro to invite a family member.
                </Text>
              </View>
            )}

            {/* Privacy note */}
            <View style={styles.privacyCard}>
              <Text style={styles.privacyTitle}>🔒 Data Privacy</Text>
              <Text style={styles.privacyBody}>
                Each family member has their own completely private account. No one can see another member's credit data, disputes, letters, or scores — only the subscription is shared.
              </Text>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLORS.background },
  centered:     { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText:    { color: COLORS.danger, fontSize: 15, textAlign: 'center', marginBottom: 16 },
  retryBtn:     { backgroundColor: COLORS.purple, paddingHorizontal: 24, paddingVertical: 11, borderRadius: 10 },
  retryBtnText: { color: COLORS.text, fontWeight: '600' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { fontSize: 17, color: COLORS.purple, fontWeight: '500', minWidth: 50 },
  title:   { fontSize: 18, fontWeight: '700', color: COLORS.text },

  scroll:        { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 48 },

  // Seats card
  seatsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.purple + '40',
    marginBottom: 16,
  },
  seatsTitleRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  seatsTitle:      { fontSize: 16, fontWeight: '700', color: COLORS.text },
  seatsBadge:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  seatsBadgeFull:  { backgroundColor: COLORS.warning + '15', borderColor: COLORS.warning + '40' },
  seatsBadgeAvail: { backgroundColor: COLORS.success + '15', borderColor: COLORS.success + '40' },
  seatsBadgeText:  { fontSize: 12, fontWeight: '700' },
  seatsSubtitle:   { fontSize: 13, color: COLORS.textSecondary, marginBottom: 20 },
  seatsHighlight:  { color: COLORS.purple, fontWeight: '700' },
  seatsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 16,
  },
  seatItem:  { alignItems: 'center', gap: 6 },
  seatDot: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  seatDotFilled: { backgroundColor: COLORS.purple + '25', borderColor: COLORS.purple },
  seatDotEmpty:  { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderStyle: 'dashed' },
  seatDotIcon:   { fontSize: 24 },
  seatLabel:     { fontSize: 11, color: COLORS.textSecondary, fontWeight: '500', textAlign: 'center', maxWidth: 80 },

  seatProgressTrack: {
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  seatProgressFill:  { height: '100%', borderRadius: 3 },
  seatProgressLabel: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'right' },

  // Secondary member card
  secondaryCard: {
    backgroundColor: COLORS.success + '15',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.success + '40',
    alignItems: 'center',
  },
  secondaryIcon:  { fontSize: 36, marginBottom: 10 },
  secondaryTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  secondaryBody:  { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },

  // Restriction notice (secondary users only)
  restrictionCard: {
    backgroundColor: COLORS.danger + '10',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.danger + '30',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  restrictionIcon: { fontSize: 20 },
  restrictionBody: { flex: 1 },
  restrictionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.danger, marginBottom: 4 },
  restrictionText:  { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },

  // How it works
  howCard: {
    backgroundColor: COLORS.primary + '12',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  howTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  stepRow:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  stepBubble: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  stepNum:  { fontSize: 12, fontWeight: '700', color: '#fff' },
  stepText: { fontSize: 13, color: COLORS.textSecondary, flex: 1, lineHeight: 20 },

  // Invite form
  inviteFormCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inviteFormTitle:    { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  inviteFormSubtitle: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 14 },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  emailInput: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.text,
  },
  emailInputError: { borderColor: COLORS.danger },
  emailErrorText:  { color: COLORS.danger, fontSize: 12, marginTop: 6 },
  sendBtn: {
    backgroundColor: COLORS.purple,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 70,
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
  seatFullText:    { fontSize: 13, color: COLORS.textSecondary, lineHeight: 20 },

  // Invite list
  section:      { marginBottom: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginBottom: 10 },
  inviteListCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  inviteRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  rowBorder:   { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  inviteLeft:  { flex: 1 },
  inviteEmail: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  inviteMeta:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText:  { fontSize: 11, fontWeight: '600' },
  inviteDate:  { fontSize: 11, color: COLORS.textSecondary },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: COLORS.danger + '15',
    borderWidth: 1,
    borderColor: COLORS.danger + '40',
    marginLeft: 10,
  },
  cancelBtnText: { fontSize: 12, color: COLORS.danger, fontWeight: '600' },

  emptyInvites:     { alignItems: 'center', paddingVertical: 8, marginBottom: 16 },
  emptyInvitesText: { color: COLORS.textSecondary, fontSize: 13 },

  // Disabled (plan doesn't include invites)
  disabledCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  disabledText: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20, textAlign: 'center' },

  // Privacy note
  privacyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  privacyTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  privacyBody:  { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
});

export default FamilyScreen;
