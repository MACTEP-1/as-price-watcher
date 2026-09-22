import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { isKnownAirport, searchAirports, type Airport } from '../../lib/airports'

/**
 * Mobile counterpart to components/AirportAutocomplete.tsx (web) — same
 * lib/airports.ts search, same "lookup aid only" contract: the raw typed
 * text is still what's reported via onChange, so a known 3-letter code
 * still works exactly as it did with the old plain TextInput. See
 * app/api/watches/route.ts for the actual validation.
 *
 * No native "click outside to close" in React Native, so this closes the
 * suggestion list on blur instead — delayed slightly so a tap on a
 * suggestion still registers first (same problem the web version solves
 * with onMouseDown-before-blur).
 *
 * Once the field is left holding a 3-letter code that isn't in the curated
 * list, an amber hint asks the user to double-check it — same soft,
 * non-blocking warning as the web form (`9cccc2b`), prompted by a ZEH→SEA
 * watch (a typo for ZRH) that ran 5 daily checks without ever returning a
 * price. Shown only after the field loses focus, so typing "ZUR" on the way
 * to "Zurich" doesn't flash a warning mid-word.
 */

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}

export default function AirportAutocomplete({ label, value, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const results = searchAirports(value, 5)
  const unknownCode = !focused && /^[A-Z]{3}$/.test(value) && !isKnownAirport(value)

  function pick(airport: Airport) {
    onChange(airport.code)
    setOpen(false)
  }

  function handleFocus() {
    if (blurTimeout.current) clearTimeout(blurTimeout.current)
    setFocused(true)
    setOpen(true)
  }

  function handleBlur() {
    setFocused(false)
    blurTimeout.current = setTimeout(() => setOpen(false), 150)
  }

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, unknownCode && styles.inputWarn]}
        value={value}
        onChangeText={(v) => onChange(v.toUpperCase())}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        autoCapitalize="characters"
        autoCorrect={false}
      />
      {unknownCode && (
        <Text style={styles.warnText}>
          {value} isn&apos;t in our airport list — double-check the code.
        </Text>
      )}

      {open && results.length > 0 && (
        <View style={styles.dropdown}>
          {results.map((a, i) => (
            <Pressable
              key={a.code}
              onPress={() => pick(a)}
              style={[styles.row, i === results.length - 1 && styles.rowLast]}
            >
              <Text style={styles.code}>{a.code}</Text>
              <Text style={styles.city} numberOfLines={1}>
                {a.city}, {a.country} — {a.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#fff',
  },
  inputWarn: { borderColor: '#f59e0b' },
  warnText: { fontSize: 12, color: '#b45309', marginTop: 6 },
  dropdown: {
    marginTop: 6,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  row: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  rowLast: { borderBottomWidth: 0 },
  code: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  city: { fontSize: 12, color: '#64748b', marginTop: 1 },
})
