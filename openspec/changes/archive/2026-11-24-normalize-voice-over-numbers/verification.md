# Manual check: real provider, `apply_text_normalization: "on"`

Run through `createElevenLabsVoiceProvider` with `eleven_multilingual_v2`, voice `4YYIPFl9wE5c4L2eu2Gb`, then transcribed with ElevenLabs speech-to-text (`scribe_v1`).

Amounts checked: $2,640, $3,342, $2,708, $2,512.80, $13,500, $1,776, $444, plus 20%, 2027, 61 to 90 and December 7th.

Heard (transcript):

> Use that as an example today. Two hundred and twenty dollars times twelve is two thousand six hundred and forty dollars a year. Add the three thousand nine dollars baseline, uh, and your total is about three thousand three hundred and forty-two dollars. Original, two hundred and ninety-two dollars deductible plus twenty percent of the remaining two thousand seven hundred and eight dollars, which is about five hundred and forty-two dollars. That's two thousand five hundred and twelve dollars and eighty cents a year. Medigap at about five thousand nine hundred to forty-one dollars starts to beat Original when covered outpatient bills pass roughly thirteen thousand five hundred dollars a year. In twenty twenty-seven, the Part A hospital deductible is one thousand seven hundred and seventy-six dollars per benefit period. After that, days sixty-one to ninety in the hospital cost you four hundred and forty-four dollars a day. Before December seventh, check three things.

Result: every amount is read correctly. One oddity: `$5,941` came out as "five thousand nine hundred to forty-one dollars" (a stray "to"; the number is still right). Not seen in the earlier on/off test, so it is recorded here, not fixed. Single run; the provider is not deterministic.
