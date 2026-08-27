import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { getConfig } from '../../config/index.js';
import { ROLE_ATTIRE_INDEX, type RoleAttireEntry } from './portrait-role-attire-index.js';

const BUILTIN_ROLE_ATTIRE_EXTENSIONS: RoleAttireEntry[] = [
  {
    id: 'cn-empress-dowager',
    label: '太后',
    category: 'ancient-cn-royal',
    keywords: ['太后', '皇太后', 'empress dowager'],
    identityPrompt: 'imperial matriarch identity, supreme court influence and calm commanding authority',
    attirePrompt: 'senior imperial court hanfu, phoenix motifs, layered brocade, ceremonial hair crown and jade ornaments',
  },
  {
    id: 'cn-imperial-consort',
    label: '贵妃/嫔妃',
    category: 'ancient-cn-royal',
    keywords: ['贵妃', '嫔妃', '妃子', 'consort'],
    identityPrompt: 'imperial consort identity, refined court etiquette and subtle political influence',
    attirePrompt: 'luxurious palace hanfu, fine silk layering, phoenix hairpins, rank-appropriate ornaments and court makeup',
  },
  {
    id: 'cn-chief-eunuch',
    label: '司礼监掌印太监',
    category: 'ancient-cn-court',
    keywords: ['太监', '宦官', '中官', '司礼监', '掌印太监', 'eunuch'],
    identityPrompt: 'inner-court power broker identity, restrained menace and palace protocol mastery',
    attirePrompt: 'court eunuch formal robe, dark satin texture, rank sash, refined but severe palace insignia details',
  },
  {
    id: 'cn-palace-eunuch-attendant',
    label: '内廷太监随侍',
    category: 'ancient-cn-court',
    keywords: ['内侍', '小太监', '随侍', 'palace eunuch attendant'],
    identityPrompt: 'palace attendant identity, alert obedience and survival-minded etiquette',
    attirePrompt: 'lightweight palace servant uniform, clean layered robe, practical waist accessories, restrained color palette',
  },
  {
    id: 'cn-imperial-physician',
    label: '太医',
    category: 'ancient-cn-civil',
    keywords: ['太医', '御医', '医官', 'imperial physician'],
    identityPrompt: 'imperial medical officer identity, precise observation and scholarly professionalism',
    attirePrompt: 'formal physician robe with medicine pouch, layered sleeves, subtle rank badge and clean fabric structure',
  },
  {
    id: 'cn-censor',
    label: '御史/言官',
    category: 'ancient-cn-civil',
    keywords: ['御史', '言官', '都察院', 'censor'],
    identityPrompt: 'court supervisory official identity, moral rigidity and fearless political posture',
    attirePrompt: 'strict official robe with austere palette, high-collar structure, rank patch and disciplined ceremonial details',
  },
  {
    id: 'cn-prefect-magistrate',
    label: '知府/县令',
    category: 'ancient-cn-civil',
    keywords: ['知府', '县令', '父母官', 'magistrate', 'prefect'],
    identityPrompt: 'regional administrator identity, literati governance style and pragmatic local authority',
    attirePrompt: 'local magistrate official robe, formal hat, rank insignia and practical civil administration accessories',
  },
  {
    id: 'cn-imperial-academician',
    label: '翰林学士',
    category: 'ancient-cn-civil',
    keywords: ['翰林', '学士', '状元', '进士', 'imperial scholar'],
    identityPrompt: 'imperial academy scholar identity, intellectual elegance and elite literati temperament',
    attirePrompt: 'scholar-official robe with layered collar, elegant silk texture, writing accessories and restrained ornaments',
  },
  {
    id: 'cn-banner-general',
    label: '禁军统领',
    category: 'ancient-cn-military',
    keywords: ['禁军', '统领', '都统', 'imperial guard commander'],
    identityPrompt: 'imperial guard command identity, battlefield discipline and palace-security authority',
    attirePrompt: 'high-rank guard armor with ceremonial cloak, reinforced shoulders, command insignia and weapon-ready belt',
  },
  {
    id: 'cn-yamen-constable',
    label: '捕快/衙役',
    category: 'ancient-cn-military',
    keywords: ['捕快', '衙役', '差役', 'constable'],
    identityPrompt: 'local law-enforcement identity, streetwise vigilance and practical toughness',
    attirePrompt: 'functional constable uniform, travel-worn fabrics, utility belt, badge marker and pursuit-ready silhouette',
  },
  {
    id: 'cn-biaoshi',
    label: '镖师',
    category: 'ancient-cn-military',
    keywords: ['镖师', '镖局', 'escort master'],
    identityPrompt: 'armed escort identity, road-hardened confidence and protective professionalism',
    attirePrompt: 'martial travel outfit with leather guards, layered vest, practical straps and movement-first tailoring',
  },
  {
    id: 'cn-salt-merchant',
    label: '盐商/大商贾',
    category: 'ancient-cn-civilian',
    keywords: ['盐商', '商贾', '富商', 'merchant magnate'],
    identityPrompt: 'high-wealth merchant identity, social sophistication and strategic pragmatism',
    attirePrompt: 'luxury civilian robe with premium fabrics, embroidered hems, jade ring accessories and status-signaling details',
  },
  {
    id: 'cn-craftsman-master',
    label: '匠师',
    category: 'ancient-cn-civilian',
    keywords: ['匠人', '匠师', '工匠', 'artisan master'],
    identityPrompt: 'master craftsman identity, focused professionalism and technique-first demeanor',
    attirePrompt: 'artisan workwear with layered apron, tool belt, textured fabrics and craft-specific practical details',
  },
  {
    id: 'cn-courtesan',
    label: '花魁/名伶',
    category: 'ancient-cn-civilian',
    keywords: ['花魁', '名伶', '歌姬', 'courtesan'],
    identityPrompt: 'high-culture performer identity, captivating charisma and socially adaptive elegance',
    attirePrompt: 'ornate performance hanfu, flowing silk layers, delicate jewelry, refined makeup and expressive sleeves',
  },
  {
    id: 'cn-buddhist-monk',
    label: '僧人',
    category: 'ancient-cn-civilian',
    keywords: ['僧人', '和尚', '禅师', 'monk'],
    identityPrompt: 'buddhist practitioner identity, calm spirituality and ascetic restraint',
    attirePrompt: 'traditional monk robe with plain textures, prayer beads, layered cloth and minimalist religious details',
  },
  {
    id: 'cn-daoist-priest',
    label: '道士',
    category: 'ancient-cn-civilian',
    keywords: ['道士', '道长', '方士', 'daoist priest'],
    identityPrompt: 'daoist ritual specialist identity, mystic composure and esoteric discipline',
    attirePrompt: 'daoist ritual attire with layered robe, symbolic talisman accessories, cloth belt and natural fabric tones',
  },
  {
    id: 'cn-assassin',
    label: '刺客',
    category: 'ancient-cn-military',
    keywords: ['刺客', '杀手', '死士', 'assassin'],
    identityPrompt: 'covert assassin identity, controlled lethality and silent intent',
    attirePrompt: 'stealth combat outfit, dark layered fabrics, concealed weapon harness and agile body-fit structure',
  },
  {
    id: 'cn-spymaster',
    label: '密探统领',
    category: 'ancient-cn-special',
    keywords: ['密探', '暗桩', '情报头目', 'spymaster'],
    identityPrompt: 'intelligence network leader identity, unreadable composure and strategic manipulation aura',
    attirePrompt: 'low-profile elite attire, layered cloak and robe blend, hidden pockets, coded insignia and discreet luxury',
  },
  {
    id: 'xianxia-sword-cultivator',
    label: '剑修',
    category: 'xianxia',
    keywords: ['剑修', '剑仙', 'sword cultivator'],
    identityPrompt: 'sword-cultivator identity, focused willpower and disciplined martial spirituality',
    attirePrompt: 'sleek cultivation robe with sword harness, flowing hems, sect motifs and wind-reactive layered sleeves',
  },
  {
    id: 'xianxia-alchemist',
    label: '丹师',
    category: 'xianxia',
    keywords: ['丹师', '炼丹', 'alchemist'],
    identityPrompt: 'cultivation alchemist identity, methodical intellect and subtle arcane authority',
    attirePrompt: 'alchemist robe with talisman pockets, herb sachets, furnace-themed motifs and elegant utility layering',
  },
  {
    id: 'xianxia-beast-tamer',
    label: '御兽师',
    category: 'xianxia',
    keywords: ['御兽', '御兽师', 'beast tamer'],
    identityPrompt: 'beast-tamer identity, primal affinity and controlled feral confidence',
    attirePrompt: 'adventure-oriented cultivation outfit, reinforced travel layers, spirit-beast totems and practical movement gear',
  },
  {
    id: 'western-knight',
    label: '骑士/游侠骑士',
    category: 'western-medieval-military',
    keywords: ['骑士', '游侠', 'knight', 'paladin'],
    identityPrompt: 'chivalric knight identity, martial honor and martial prowess',
    attirePrompt: 'full plate armor with heraldic surcoat, chainmail underlayer, plated gauntlets, longsword and shield, knightly cloak',
  },
  {
    id: 'western-lord',
    label: '领主/伯爵',
    category: 'western-medieval-royal',
    keywords: ['领主', '伯爵', '公爵', '男爵', 'lord', 'duke', 'baron', 'count'],
    identityPrompt: 'feudal lord identity, territorial authority and noble bearing',
    attirePrompt: 'medieval noble doublet with fur trim, heraldic tabard, jeweled belt, signet ring, fur-trimmed cloak',
  },
  {
    id: 'western-bishop',
    label: '主教/教士',
    category: 'western-medieval-mystic',
    keywords: ['主教', '教士', '教皇', '神父', 'bishop', 'priest', 'pope'],
    identityPrompt: 'church prelate identity, spiritual authority and liturgical solemnity',
    attirePrompt: 'elaborate liturgical vestments, mitre or biretta, embroidered chasuble, pectoral cross, ceremonial robes',
  },
  {
    id: 'western-court-mage',
    label: '宫廷法师',
    category: 'western-medieval-mystic',
    keywords: ['法师', '巫师', '术士', 'mage', 'wizard', 'sorcerer'],
    identityPrompt: 'court mage identity, arcane scholarship and mystical authority',
    attirePrompt: 'ornate mage robes with starry embroidery, pointed hat, staff, grimoire satchel, runic accessories',
  },
  {
    id: 'western-troubadour',
    label: '吟游诗人',
    category: 'western-medieval-civil',
    keywords: ['吟游诗人', '游吟', 'troubadour', 'bard', 'minstrel'],
    identityPrompt: 'wandering bard identity, artistic charisma and social adaptability',
    attirePrompt: 'colorful traveling minstrel outfit, layered cloak, lute strap, feathered cap, expressive performance garb',
  },
  {
    id: 'antiquity-roman-consul',
    label: '罗马执政官',
    category: 'western-antiquity-royal',
    keywords: ['执政官', '元老', 'consul', 'senator', 'imperator'],
    identityPrompt: 'roman magistrate identity, senatorial authority and republican dignity',
    attirePrompt: 'roman senatorial toga with purple border (toga praetexta), tunica underneath, calcei patricii shoes, laurel wreath',
  },
  {
    id: 'antiquity-hoplite',
    label: '希腊重装步兵',
    category: 'western-antiquity-military',
    keywords: ['斯巴达', '重装步兵', 'hoplite', 'spartan', 'centurion', '角斗士', 'gladiator'],
    identityPrompt: 'classical warrior identity, disciplined valor and martial tradition',
    attirePrompt: 'bronze cuirass or linothorax armor, crested corinthian helmet, greaves, round hoplon shield, dory spear',
  },
  {
    id: 'antiquity-egypt-pharaoh',
    label: '法老',
    category: 'western-antiquity-royal',
    keywords: ['法老', 'pharaoh', '埃及王'],
    identityPrompt: 'divine kingship identity, celestial authority and timeless majesty',
    attirePrompt: 'egyptian royal regalia, nemes headdress with uraeus cobra, ceremonial kilt, golden collar usekh, crook and flail',
  },
  {
    id: 'myth-tribal-chieftain',
    label: '部落首领',
    category: 'ancient-myth-royal',
    keywords: ['首领', '酋长', '族长', 'chieftain', 'tribal leader'],
    identityPrompt: 'primordial chieftain identity, primal authority and ancestral wisdom',
    attirePrompt: 'ceremonial tribal regalia, animal pelt mantle, bone and jade crown, totemic staff, primitive bronze ornaments',
  },
  {
    id: 'myth-shaman',
    label: '巫/祭司',
    category: 'ancient-myth-mystic',
    keywords: ['巫', '祭司', '萨满', 'shaman', 'shamanic priest'],
    identityPrompt: 'archaic shaman identity, spirit-world mediation and ritual mastery',
    attirePrompt: 'ritual shamanic attire, animal skull mask, feathered cloak, bone charm necklace, ceremonial drum, body paint markings',
  },
  {
    id: 'myth-deity-descendant',
    label: '神裔/神族',
    category: 'ancient-myth-royal',
    keywords: ['神裔', '神族', '半神', 'demigod', 'divine descendant'],
    identityPrompt: 'divine-blooded identity, transcendent aura and mythic authority',
    attirePrompt: 'mythic divine regalia, dragon-patterned ancient robes, celestial jade ornaments, glowing divine motifs, primordial ceremonial garb',
  },
  {
    id: 'jp-samurai',
    label: '武士/侍',
    category: 'japanese-feudal-military',
    keywords: ['武士', '侍', 'samurai', 'bushi'],
    identityPrompt: 'samurai warrior identity, bushido discipline and martial honor',
    attirePrompt: 'samurai armor with lacquered lamellar plates (dou), kabuto helmet with maedate crest, sashimono banner, katana and wakizashi daisho',
  },
  {
    id: 'jp-daimyo',
    label: '大名/将军',
    category: 'japanese-feudal-royal',
    keywords: ['大名', '将军', 'daimyo', 'shogun'],
    identityPrompt: 'feudal warlord identity, territorial supremacy and military-political authority',
    attirePrompt: 'ornate daimyo armor with gold lacquer, jinbaori surcoat, elaborate kabuto with crescent crest, ceremonial fan, formal court kimono underneath',
  },
  {
    id: 'jp-geisha',
    label: '艺伎/花魁',
    category: 'japanese-feudal-civil',
    keywords: ['艺伎', '花魁', 'geisha', 'oiran', '游女'],
    identityPrompt: 'floating-world entertainer identity, refined artistry and social grace',
    attirePrompt: 'elaborate silk kimono with obi sash, ornate kanzashi hairpins, traditional white makeup, geta sandals, folding fan',
  },
  {
    id: 'apoc-survivor',
    label: '末世幸存者',
    category: 'post-apocalyptic-survivor',
    keywords: ['幸存者', '求生者', 'survivor', 'wanderer'],
    identityPrompt: 'post-apocalyptic survivor identity, hardened resilience and resourceful pragmatism',
    attirePrompt: 'scavenged layered survival outfit, patched jacket, cargo pants, makeshift armor plates, gas mask, utility backpack, worn boots',
  },
  {
    id: 'apoc-scavenger',
    label: '废土拾荒者',
    category: 'post-apocalyptic-survivor',
    keywords: ['拾荒者', '拾荒', 'scavenger', 'scrapper'],
    identityPrompt: 'wasteland scavenger identity, opportunistic adaptability and technical cunning',
    attirePrompt: 'patchwork wasteland gear, repurposed tactical vest, tool belt, protective goggles, respirator, scavenged tech accessories',
  },
];

const CUSTOM_DICTIONARY_FILE = path.resolve(
  getConfig().dataDir,
  'config',
  'portrait-role-attire-custom.json',
);

let customRoleAttireEntriesCache: RoleAttireEntry[] | null = null;

function normalizeKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const keyword = typeof item === 'string' ? item.trim() : '';
    if (!keyword) continue;
    const dedupeKey = keyword.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(keyword);
  }
  return out;
}

function normalizeRoleAttireEntry(raw: unknown): RoleAttireEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<RoleAttireEntry>;
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
  const category = typeof candidate.category === 'string' ? candidate.category.trim() : '';
  const identityPrompt = typeof candidate.identityPrompt === 'string'
    ? candidate.identityPrompt.trim()
    : '';
  const attirePrompt = typeof candidate.attirePrompt === 'string'
    ? candidate.attirePrompt.trim()
    : '';
  const keywords = normalizeKeywords(candidate.keywords);
  if (!id || !label || !category || !identityPrompt || !attirePrompt) {
    return null;
  }
  return { id, label, category, keywords, identityPrompt, attirePrompt };
}

function normalizeRoleAttireEntries(raw: unknown): RoleAttireEntry[] {
  if (!Array.isArray(raw)) return [];
  const deduped = new Map<string, RoleAttireEntry>();
  for (const item of raw) {
    const normalized = normalizeRoleAttireEntry(item);
    if (!normalized) continue;
    deduped.set(normalized.id, normalized);
  }
  return Array.from(deduped.values());
}

function mergeEntries(...groups: RoleAttireEntry[][]): RoleAttireEntry[] {
  const merged = new Map<string, RoleAttireEntry>();
  for (const group of groups) {
    for (const entry of group) {
      merged.set(entry.id, entry);
    }
  }
  return Array.from(merged.values());
}

function readCustomRoleAttireEntriesFromDisk(): RoleAttireEntry[] {
  try {
    if (!fs.existsSync(CUSTOM_DICTIONARY_FILE)) return [];
    const raw = fs.readFileSync(CUSTOM_DICTIONARY_FILE, 'utf-8');
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw) as unknown;
    return normalizeRoleAttireEntries(parsed);
  } catch {
    return [];
  }
}

function ensureCustomRoleAttireEntriesLoaded(): RoleAttireEntry[] {
  if (!customRoleAttireEntriesCache) {
    customRoleAttireEntriesCache = readCustomRoleAttireEntriesFromDisk();
  }
  return customRoleAttireEntriesCache;
}

export function getBuiltinRoleAttireExtensions(): RoleAttireEntry[] {
  return BUILTIN_ROLE_ATTIRE_EXTENSIONS.map(entry => ({ ...entry, keywords: [...entry.keywords] }));
}

export function getCustomRoleAttireEntries(): RoleAttireEntry[] {
  return ensureCustomRoleAttireEntriesLoaded().map(entry => ({ ...entry, keywords: [...entry.keywords] }));
}

export function getSystemRoleAttireEntries(): RoleAttireEntry[] {
  return mergeEntries(ROLE_ATTIRE_INDEX, BUILTIN_ROLE_ATTIRE_EXTENSIONS);
}

export function getMergedRoleAttireEntries(): RoleAttireEntry[] {
  return mergeEntries(getSystemRoleAttireEntries(), getCustomRoleAttireEntries());
}

export async function saveCustomRoleAttireEntries(customEntries: unknown): Promise<RoleAttireEntry[]> {
  const normalized = normalizeRoleAttireEntries(customEntries);
  const dir = path.dirname(CUSTOM_DICTIONARY_FILE);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(CUSTOM_DICTIONARY_FILE, JSON.stringify(normalized, null, 2), 'utf-8');
  customRoleAttireEntriesCache = normalized;
  return getCustomRoleAttireEntries();
}
