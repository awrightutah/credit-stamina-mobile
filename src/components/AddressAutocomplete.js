/**
 * AddressAutocomplete
 *
 * Uses the Google Places Autocomplete + Place Details REST APIs directly
 * (no native library / no pod install required).
 *
 * Props:
 *   initialValue  {string}   pre-fill the text input
 *   onSelect      {Function} called with { street, city, state, zip } when user picks a result
 *   placeholder   {string}
 *   style         {object}   extra style for the outer container
 *
 * ⚠️  Set your key in src/config/googlePlacesKey.js
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import axios from 'axios';
import { GOOGLE_PLACES_API_KEY } from '../config/googlePlacesKey';

const COLORS = {
  background: '#0f172a',
  card: '#111827',
  surface: '#1e293b',
  text: '#FFFFFF',
  textSecondary: '#6B7280',
  border: '#374151',
  purple: '#7C3AED',
};

const AUTOCOMPLETE_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const DETAILS_URL      = 'https://maps.googleapis.com/maps/api/place/details/json';

// Pull a specific component type out of Google's address_components array
const getComponent = (components, type, useShort = false) => {
  const found = components.find(c => c.types.includes(type));
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
    if (!GOOGLE_PLACES_API_KEY || GOOGLE_PLACES_API_KEY === 'YOUR_GOOGLE_PLACES_API_KEY') {
      console.warn('[AddressAutocomplete] Google Places API key not set in src/config/googlePlacesKey.js');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.get(AUTOCOMPLETE_URL, {
        params: {
          input,
          key: GOOGLE_PLACES_API_KEY,
          types: 'address',
          components: 'country:us',
          language: 'en',
        },
        timeout: 8000,
      });
      const preds = res.data?.predictions ?? [];
      setPredictions(preds);
      setShowList(preds.length > 0);
    } catch (err) {
      console.error('[AddressAutocomplete] autocomplete error:', err.message);
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
    // Show the main text (street) in the input, hide dropdown immediately
    const mainText = prediction.structured_formatting?.main_text ?? prediction.description;
    setText(mainText);
    setShowList(false);
    setPredictions([]);

    // Fetch full address components to auto-fill city/state/zip
    try {
      const res = await axios.get(DETAILS_URL, {
        params: {
          place_id: prediction.place_id,
          key: GOOGLE_PLACES_API_KEY,
          fields: 'address_components',
          language: 'en',
        },
        timeout: 8000,
      });
      const components = res.data?.result?.address_components ?? [];

      const streetNumber = getComponent(components, 'street_number');
      const route        = getComponent(components, 'route');
      const street       = [streetNumber, route].filter(Boolean).join(' ') || mainText;
      const city         = getComponent(components, 'locality')
                        || getComponent(components, 'sublocality_level_1')
                        || getComponent(components, 'administrative_area_level_2');
      const state        = getComponent(components, 'administrative_area_level_1', true); // short: "TX"
      const zip          = getComponent(components, 'postal_code');

      setText(street);
      onSelect?.({ street, city, state, zip });
    } catch (err) {
      console.error('[AddressAutocomplete] details error:', err.message);
      // Fall back: just set the selected description as street
      onSelect?.({ street: mainText, city: '', state: '', zip: '' });
    }
  };

  const handleBlur = () => {
    // Small delay so tap on suggestion registers before list hides
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
          <ActivityIndicator
            size="small"
            color={COLORS.purple}
            style={styles.spinner}
          />
        )}
      </View>

      {showList && predictions.length > 0 && (
        <View style={styles.dropdown}>
          {predictions.map((pred, idx) => (
            <TouchableOpacity
              key={pred.place_id ?? idx}
              style={[styles.predictionRow, idx < predictions.length - 1 && styles.predictionBorder]}
              onPress={() => handleSelectPrediction(pred)}
              activeOpacity={0.7}
            >
              <Text style={styles.predMain} numberOfLines={1}>
                {pred.structured_formatting?.main_text ?? pred.description}
              </Text>
              {pred.structured_formatting?.secondary_text ? (
                <Text style={styles.predSub} numberOfLines={1}>
                  {pred.structured_formatting.secondary_text}
                </Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    zIndex: 999,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#111827',
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
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#1e293b',
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
