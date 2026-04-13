import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Markdown from 'react-native-markdown-display';
import { aiAPI, accountsAPI, scoresAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const COLORS = {
  staminaBlue: '#1E40AF',
  powerPurple: '#7C3AED',
  background: '#0F172A',
  card: '#1E293B',
  surface: '#1E293B',
  text: '#F1F5F9',
  textSecondary: '#64748B',
  border: '#374151',
  purple: '#7C3AED',
  success: '#059669',
  warning: '#F97316',
  danger: '#DC2626',
};

// Build a compact plain-text summary of the user's credit profile so Claude
// has real data to reference in every response.
const buildCreditContext = (accounts, scores) => {
  const lines = [];

  if (scores && scores.length > 0) {
    const latest = scores[0];
    lines.push(`Current credit score: ${latest.score} (${latest.bureau}) as of ${latest.recorded_date || 'recently'}.`);
    if (scores.length > 1) {
      const prev = scores[1];
      const change = latest.score - prev.score;
      lines.push(`Score changed ${change >= 0 ? '+' : ''}${change} pts from previous entry.`);
    }
  } else {
    lines.push('No credit scores logged yet.');
  }

  if (accounts && accounts.length > 0) {
    const activeDamage = accounts.filter(a => a.lane === 'Active Damage');
    const removable   = accounts.filter(a => a.lane === 'Removable');
    const monitor     = accounts.filter(a => a.lane === 'Aging/Monitor');
    lines.push(`Total accounts: ${accounts.length} (${activeDamage.length} Active Damage, ${removable.length} Removable, ${monitor.length} Monitor).`);

    if (activeDamage.length > 0) {
      const names = activeDamage.slice(0, 3).map(a => a.creditor || a.account_name).filter(Boolean);
      lines.push(`Active Damage accounts: ${names.join(', ')}${activeDamage.length > 3 ? ` and ${activeDamage.length - 3} more` : ''}.`);
    }
    if (removable.length > 0) {
      const names = removable.slice(0, 3).map(a => a.creditor || a.account_name).filter(Boolean);
      lines.push(`Removable accounts: ${names.join(', ')}${removable.length > 3 ? ` and ${removable.length - 3} more` : ''}.`);
    }
  } else {
    lines.push('No credit accounts uploaded yet.');
  }

  return lines.join(' ');
};

const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  content: 'Hi! I\'m your Credit Stamina AI Advisor. I can see your accounts and credit history — ask me anything about improving your score, what to dispute first, or how to build your recovery plan.',
  timestamp: new Date().toISOString(),
};

const AIAdvisorScreen = () => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [scores, setScores]     = useState([]);
  const [contextReady, setContextReady] = useState(false);
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading]     = useState(false);
  const scrollViewRef = useRef(null);

  const chatKey = user?.id ? `@ai_chat_${user.id}` : null;

  // Load persisted chat history on mount
  useEffect(() => {
    if (!chatKey) return;
    AsyncStorage.getItem(chatKey).then(raw => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved) && saved.length > 0) {
          setMessages(saved);
        }
      } catch {}
    });
  }, [chatKey]);

  // Persist chat whenever messages change (debounced via setTimeout)
  useEffect(() => {
    if (!chatKey || messages.length === 0) return;
    // Don't persist if it's just the welcome message
    if (messages.length === 1 && messages[0].id === 'welcome') return;
    const timer = setTimeout(() => {
      // Keep last 50 messages to avoid unbounded storage growth
      const toSave = messages.slice(-50);
      AsyncStorage.setItem(chatKey, JSON.stringify(toSave)).catch(() => null);
    }, 500);
    return () => clearTimeout(timer);
  }, [messages, chatKey]);

  // Load account + score data so we can pass it as context to Claude
  useEffect(() => {
    const loadContext = async () => {
      try {
        const [accRes, scRes] = await Promise.all([
          accountsAPI.getAll().catch(() => ({ data: [] })),
          scoresAPI.getAll().catch(() => ({ data: [] })),
        ]);
        const accs = accRes?.data ?? accRes ?? [];
        const scs  = scRes?.data  ?? scRes  ?? [];
        setAccounts(Array.isArray(accs) ? accs : []);
        setScores(Array.isArray(scs) ? scs : []);
      } catch (e) {
        console.error('[AIAdvisor] context load error:', e);
      } finally {
        setContextReady(true);
      }
    };
    if (user?.id) loadContext();
  }, [user?.id]);

  const handleClearChat = () => {
    Alert.alert('Clear Conversation', 'Start a fresh conversation? Your history will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          const fresh = { ...WELCOME_MESSAGE, timestamp: new Date().toISOString() };
          setMessages([fresh]);
          if (chatKey) AsyncStorage.removeItem(chatKey).catch(() => null);
        },
      },
    ]);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const sendMessage = async (text) => {
    const content = text.trim();
    if (!content || loading) return;

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setLoading(true);

    try {
      const creditContext = buildCreditContext(accounts, scores);
      const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));

      const response = await aiAPI.askQuestion({
        message: content,
        context: history,
        credit_context: creditContext,
        user_accounts: accounts,
        user_scores: scores,
      });

      const raw   = response?.data || response;
      const reply = raw?.answer || raw?.message || raw?.response || raw?.content
        || 'I couldn\'t process that request. Please try again.';

      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        content: reply,
        timestamp: new Date().toISOString(),
      }]);
    } catch (err) {
      console.error('[AI Advisor] error:', err);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        content: 'I\'m having trouble connecting right now. Please try again in a moment.',
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => sendMessage(inputText);

  const quickQuestions = [
    'What should I dispute first?',
    'How can I improve my score quickly?',
    'Should I pay off collections or dispute them?',
    'How long do negative items stay on my report?',
    'What\'s the fastest way to get to 700?',
  ];

  const renderMessage = (message) => {
    const isUser = message.role === 'user';
    return (
      <View
        key={message.id}
        style={[styles.messageContainer, isUser ? styles.userMessage : styles.assistantMessage]}
      >
        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          {isUser ? (
            <Text style={styles.userText}>{message.content}</Text>
          ) : (
            <Markdown style={markdownStyles}>{message.content}</Markdown>
          )}
        </View>
        <Text style={styles.messageTime}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  };

  // Context status badge — shows user their data is loaded
  const contextBadge = () => {
    if (!contextReady) return null;
    const hasData = accounts.length > 0 || scores.length > 0;
    return (
      <View style={styles.contextBadge}>
        <Text style={styles.contextBadgeText}>
          {hasData
            ? `🧠 Aware of ${accounts.length} account${accounts.length !== 1 ? 's' : ''} · ${scores.length} score${scores.length !== 1 ? 's' : ''}`
            : '⚠️ No data — upload a credit report to unlock personalized advice'}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>AI Credit Advisor</Text>
          <Text style={styles.subtitle}>Personalized credit repair guidance</Text>
        </View>
        {messages.length > 1 && (
          <TouchableOpacity onPress={handleClearChat} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.clearBtn}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {contextBadge()}

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
        >
          {messages.map(renderMessage)}

          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#8B5CF6" />
              <Text style={styles.loadingText}>Thinking...</Text>
            </View>
          )}
        </ScrollView>

        {messages.length === 1 && (
          <View style={styles.quickQuestionsContainer}>
            <Text style={styles.quickQuestionsTitle}>Quick Questions</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickQuestionsScroll}>
              {quickQuestions.map((question, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.quickQuestionButton}
                  onPress={() => sendMessage(question)}
                  disabled={loading}
                >
                  <Text style={styles.quickQuestionText}>{question}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask me anything about credit..."
            placeholderTextColor="#6B7280"
            multiline
            maxLength={500}
            editable={!loading}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || loading) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || loading}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const markdownStyles = {
  body: { color: '#E5E7EB', fontSize: 15, lineHeight: 22 },
  strong: { color: '#F1F5F9', fontWeight: '700' },
  em: { color: '#E5E7EB', fontStyle: 'italic' },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { color: '#E5E7EB', fontSize: 15, lineHeight: 22 },
  code_inline: { color: '#A5B4FC', backgroundColor: '#1E293B', borderRadius: 4, paddingHorizontal: 4, fontFamily: 'Courier' },
  code_block: { color: '#A5B4FC', backgroundColor: '#1E293B', borderRadius: 8, padding: 12, fontFamily: 'Courier' },
  fence: { color: '#A5B4FC', backgroundColor: '#1E293B', borderRadius: 8, padding: 12, fontFamily: 'Courier' },
  heading1: { color: '#F1F5F9', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  heading2: { color: '#F1F5F9', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  heading3: { color: '#F1F5F9', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  paragraph: { marginBottom: 6 },
  hr: { backgroundColor: '#374151', height: 1, marginVertical: 8 },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  clearBtn: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  contextBadge: {
    backgroundColor: COLORS.purple + '18',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.purple + '40',
    paddingHorizontal: 20,
    paddingVertical: 7,
  },
  contextBadgeText: {
    fontSize: 12,
    color: COLORS.purple,
    fontWeight: '500',
  },
  keyboardContainer: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 8,
  },
  messageContainer: {
    marginBottom: 16,
  },
  userMessage: {
    alignItems: 'flex-end',
  },
  assistantMessage: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '82%',
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: COLORS.purple,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: COLORS.card,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: COLORS.text,
  },
  assistantText: {
    color: '#E5E7EB',
  },
  messageTime: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    alignSelf: 'flex-start',
    maxWidth: '60%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  loadingText: {
    color: COLORS.textSecondary,
    marginLeft: 8,
    fontSize: 14,
  },
  quickQuestionsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  quickQuestionsTitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  quickQuestionsScroll: {
    flexDirection: 'row',
  },
  quickQuestionButton: {
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickQuestionText: {
    color: COLORS.text,
    fontSize: 13,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 11,
    color: COLORS.text,
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sendButton: {
    backgroundColor: COLORS.purple,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 22,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.border,
  },
  sendButtonText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
});

export default AIAdvisorScreen;
