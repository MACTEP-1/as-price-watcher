import { useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker'

/**
 * Replaces the plain YYYY-MM-DD text field mobile/app/watches/new.tsx used
 * for dates (see that file's own header comment on why — this needed a new
 * native dependency and a dev-client rebuild, deferred until there was a
 * build handy to test against).
 *
 * Deliberately parses/formats using LOCAL Date getters/constructor
 * arguments (new Date(y, m, d), .getFullYear()/.getMonth()/.getDate()) —
 * NEVER toISOString() or the single-string Date constructor. This app has
 * already shipped one real bug from that exact class of mistake: a
 * date-only string parses as UTC midnight, so toISOString() on it (or on a
 * Date built from one without a time component) can roll the calendar date
 * backward by up to a day depending on the device's timezone — see
 * CLAUDE.md's "Trip type" section and the depart_date expiry fix
 * (commit 8301730). The picker's `value`/`onChange` Date objects represent
 * a LOCAL calendar date the user tapped, so they must be read back out in
 * local terms, not UTC.
 *
 * iOS uses display="compact" (2026-09-16), not "inline". "inline" renders
 * the full calendar grid AS A CHILD VIEW laid out by our own flexbox, so
 * when this field sits in the half-width "Return date" column of the
 * round-trip row (mobile/app/watches/new.tsx), the grid was wider than its
 * parent and got clipped against the screen's right edge — confirmed via
 * simulator screenshots, most of the grid unreachable. "compact" instead
 * renders a small native button; tapping it opens iOS's own calendar
 * popover as a system overlay that isn't a child of our layout at all, so
 * it can't be squished by a narrow parent column and iOS keeps it fully
 * on-screen itself. It also dismisses on outside tap, so — on iOS only —
 * there's no need for our own open/close state or a Done button anymore.
 */

function parseDateString(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d) // local midnight — unambiguous, no string-parsing rules involved
}

function toDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface Props {
  label: string
  value: string // 'YYYY-MM-DD', or '' for unset
  onChange: (value: string) => void
  minimumDate: string // 'YYYY-MM-DD'
  placeholder: string
}

export default function DatePickerField({
  label,
  value,
  onChange,
  minimumDate,
  placeholder,
}: Props) {
  const [show, setShow] = useState(false)

  const selected = parseDateString(value || minimumDate)
  const min = parseDateString(minimumDate)

  function handleChange(event: DateTimePickerEvent, picked?: Date) {
    // Android's picker is a modal dialog that closes itself on any
    // interaction, so it needs its own `show` state toggled off here. iOS's
    // "compact" picker manages its own popover open/close entirely inside
    // the native component below — this handler never touches `show` on
    // iOS because iOS never sets it.
    if (Platform.OS === 'android') setShow(false)
    if (event.type === 'dismissed' || !picked) return
    onChange(toDateString(picked))
  }

  if (Platform.OS === 'ios') {
    return (
      <View>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.iosCompactBox}>
          <DateTimePicker
            value={selected}
            mode="date"
            display="compact"
            minimumDate={min}
            onChange={handleChange}
          />
        </View>
      </View>
    )
  }

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.input} onPress={() => setShow(true)}>
        <Text style={value ? styles.inputText : styles.placeholder}>
          {value || placeholder}
        </Text>
      </Pressable>

      {show && (
        <DateTimePicker
          value={selected}
          mode="date"
          display="default"
          minimumDate={min}
          onChange={handleChange}
        />
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
    backgroundColor: '#fff',
  },
  inputText: { fontSize: 15, color: '#0f172a' },
  placeholder: { fontSize: 15, color: '#94a3b8' },
  // Houses the "compact" DateTimePicker so it reads as one of this form's
  // bordered fields rather than a bare native control. The picker sizes
  // itself to its own content (a short date button), so this box doesn't
  // need a fixed width — that's exactly what keeps it safe inside the
  // half-width round-trip column; see the file header comment.
  iosCompactBox: {
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    alignItems: 'flex-start',
  },
})
