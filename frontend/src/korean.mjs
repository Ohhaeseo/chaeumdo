// Adds 을 after a final consonant and 를 otherwise, e.g. 종로구를, 강릉을.
export function withObjectParticle(value) {
  const last = value.charCodeAt(value.length - 1);
  const hasBatchim = last >= 0xAC00 && last <= 0xD7A3 && (last - 0xAC00) % 28 !== 0;
  return `${value}${hasBatchim ? "을" : "를"}`;
}
