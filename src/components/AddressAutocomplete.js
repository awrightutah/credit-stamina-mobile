import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { placesAPI } from '../services/api';

const COLORS = {
  card: '#111827',
  surface: '#1e293b',
  text: '#FFFFFF',
  textSecondary: '#6B7280',
  border: '#374151',
  purple: '#7C3AED',
};

const getComponent = (components, type, useShort = false) => {
  const found = (components || []).find(c => c.types?.includes(type));
  return found ? (useShort ? found.short_name : found.long_name) : '';
};

const AddressAutocomplete = ({ initialValue = '', onSelect, placeholder = '123 Main St', style }) => {
  const [text, setText]               = useState(initialValue);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [showList, setShowList]       = useState(false);
  const debounceRef = useRef(null);

  const fetchPredictions = useCallback(async (input) => {
    if (!input || input.length < 3) {
      setPredictions([]);
      setShowList(false);
      return;
    }
    setLoading(true);
    try {
      const res = await placesAPI.autocomplete(input);
      const preds = Array.isArray(res.data?.predictions)
        ? res.data.predictions
        : Array.isArray(res.data) ? res.data : [];
      setPredictions(preds);
      setShowList(preds.length > 0);
    } catch (err) {
      console.error('[AddressAutocomplete] autocomplete error:', err?.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChangeText = (value) => {
    setText(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPredictions(value), 320);
  };

  const handleSelectPrediction = async (prediction) => {
    const mainText = prediction.structured_formatting?.main_text ?? prediction.description ?? '';
    setText(mainText);
    setShowList(false);
    setPredictions([]);

    try {
      const res = await placesAPI.details(prediction.place_id);
      const components = res.data?.result?.address_components
                      ?? res.data?.address_components
                      ?? [];

      const streetNumber = getComponent(components, 'street_number');
      const route        = getComponent(components, 'route');
      const street       = [streetNumber, route].filter(Boolean).join(' ') || mainText;
      const city         = getComponent(components, 'locality')
                        || getComponent(components, 'sublocality_level_1')
                        || getComponent(components, 'administrative_area_level_2');
      const state        = getComponent(components, 'administrative_area_level_1', true);
      const zip          = getComponent(components, 'postal_code');

      setText(street);
      if (onSelect) onSelect({ street, city, state, zip });
    } catch (err) {
      console.error('[AddressAutocomplete] details error:', err?.response?.data || err.message);
      if (onSelect) onSelect({ street: mainText, city: '', state: '', zip: '' });
    }
  };

  const handleBlur = () => {
    setTimeout(() => setShowList(false), 150);
  };

  return (
    <View style={[styles.wrapper, style]}>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={handleChangeText}
          onBlur={handleBlur}
          onFocus={() => predictions.length > 0 && setShowList(true)}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textSecondary}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
        />
        {loading && (
          <ActivityIndicator size="small" color={COLORS.purple} style={styles.spinner} />
        )}
      </View>

      {showList && predictions.length > 0 && (
        <View style={styles.dropdown}>
          {predictions.map((pred, idx) => (
            <TouchableOpacity
              key={pred.place_id ?? String(idx)}
              style={[
                styles.predictionRow,
                idx < predictions.length - 1 && styles.predictionBorder,
              ]}
              onPress={() => handleSelectPrediction(pred)}
              activeOpacity={0.7}
            >
              <Text style={styles.predMain} numberOfLines={1}>
                {pred.structured_formatting?.main_text ?? pred.description}
              </Text>
              {!!pred.structured_formatting?.secondary_text && (
                <Text style={styles.predSub} numberOfLines={1}>
                  {pred.structured_formatting.secondary_text}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    zIndex: 999,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: COLORS.text,
  },
  spinner: {
    position: 'absolute',
    right: 14,
  },
  dropdown: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    marginTop: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  predictionRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  predictionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  predMain: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
  },
  predSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});

export default AddressAutocomplete;
