/** Štýly a miestnosti pre návrhy dizajnu. Zoznam sa dá meniť. */
export const STYLES = {
  moderny: { label: 'Moderný', en: 'modern contemporary' },
  skandinavsky: { label: 'Škandinávsky', en: 'Scandinavian, light wood, white walls, cosy textiles' },
  vintage: { label: 'Vintage', en: 'vintage retro' },
  industrialny: { label: 'Industriálny', en: 'industrial loft, metal, brick, dark accents' },
  minimalisticky: { label: 'Minimalistický', en: 'minimalist, clean lines, few pieces' },
  boho: { label: 'Boho', en: 'bohemian, rattan, plants, warm patterns' },
  japandi: { label: 'Japandi', en: 'Japandi, natural materials, calm neutral palette' },
  hotelovy: { label: 'Luxusný hotelový', en: 'luxury boutique hotel' },
  rustikalny: { label: 'Rustikálny', en: 'rustic, natural wood, warm textures' },
  midcentury: { label: 'Mid-century', en: 'mid-century modern, walnut, tapered legs' },
  artdeco: { label: 'Art deco', en: 'art deco, geometric patterns, brass and velvet' },
  mediteransky: { label: 'Mediteránsky', en: 'Mediterranean, terracotta, white, blue accents' },
}
export const ROOMS = { obyvacka: 'Obývačka', spalna: 'Spálňa', kuchyna: 'Kuchyňa', kupelna: 'Kúpeľňa', chodba: 'Chodba', ostatne: 'Ostatné' }
const ROOM_EN = { obyvacka: 'living room', spalna: 'bedroom', kuchyna: 'kitchen', kupelna: 'bathroom', chodba: 'hallway', ostatne: 'room' }
export const CREDITS_PER_IMAGE = Number(process.env.HF_CREDITS_PER_IMAGE || 2)

export function buildPrompt(roomType, styleKey, variant) {
  const st = STYLES[styleKey] || { en: styleKey }
  const twist = variant === 'B' ? ' Use a different furniture arrangement and a different colour palette than the obvious choice.' : ''
  return `Interior design visualisation. Redesign this ${ROOM_EN[roomType] || 'room'} in ${st.en} style for a short-term rental apartment. Keep the exact room geometry, camera angle, walls, windows, doors, radiators, floor plan and ceiling as in the photo. Fully furnish and decorate it: tasteful, bright, clean, inviting, budget-friendly quality furniture, photorealistic. No people, no text, no watermark.${twist}`
}

/** Obchody pre nákup: kamenné s odberom v meste bytu a e-shopy s rýchlym doručením. */
export const VENDORS = ['IKEA', 'JYSK', 'Möbelix', 'Sconto', 'XXXLutz', 'Kondela', 'Bonami', 'Beliani', 'Alza', 'Mall.sk', 'Nay', 'Datart']
export const VENDOR_SITES = 'ikea.com/sk, jysk.sk, mobelix.sk, sconto.sk, xxxlutz.sk, kondela.sk, bonami.sk, beliani.sk, alza.sk, mall.sk, nay.sk, datart.sk'
export const PURCHASE = { najdene: 'nájdené', objednane: 'objednané', dorucene: 'doručené', zmontovane: 'zmontované' }
