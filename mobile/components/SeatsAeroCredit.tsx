import { Linking, StyleSheet, Text, View } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'

/**
 * seats.aero attribution — the React Native counterpart of
 * components/SeatsAeroCredit.tsx on the web. Kept as a separate file rather
 * than shared because the two render entirely different primitives (<p>/<a>
 * vs View/Text), so there is nothing meaningful to share but the wording.
 * Change one, change the other.
 *
 * This is a LICENSING REQUIREMENT, not decoration. seats.aero's terms
 * ("Usage of Data") state:
 *
 *   "All users of the APIs must reasonably and visibly attribute any
 *    reproduced data to seats.aero at the point which the data is searched
 *    and displayed. A link to the seats.aero website is required with the
 *    attribution."
 *
 * It applies regardless of commercial status. Every screen rendering a miles
 * figure needs one, and "reasonably and visibly" rules out shrinking it below
 * readability or dropping it to near-background contrast.
 *
 * Lives in mobile/components/ rather than mobile/app/ on purpose: Expo Router
 * turns every file under app/ into a route, and this is a component.
 *
 * The link is a nested <Text onPress>, which is the supported way to make a
 * tappable span inside a paragraph in RN — a <Pressable> here would break the
 * text flow onto its own line.
 */

const SEATS_AERO_URL = 'https://seats.aero'

export default function SeatsAeroCredit({
  style,
}: {
  /** Spacing overrides for the surrounding layout. Not for hiding it. */
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.text}>
        Award availability and miles pricing via{' '}
        <Text
          style={styles.link}
          onPress={() => {
            // Best-effort: a failed openURL must never crash a price screen.
            Linking.openURL(SEATS_AERO_URL).catch(() => {})
          }}
        >
          seats.aero
        </Text>
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 16 },
  text: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748b',
    textAlign: 'center',
  },
  link: {
    color: '#0060ac',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
})
