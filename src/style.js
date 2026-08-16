/**
 * 译风控制 —— 把用户在界面上的几个选择，编译成两种引擎各自吃的指令。
 *
 * 做法取自 foguang.ai 公开说明的产品模式：先选文本类别，再调若干风格维度，
 * 系统把选择拼成给模型的指令，而不是让用户自己写 prompt。
 * （"Choose the type of source text … and fine-tune five style dimensions
 *   … The system pairs your choices with curated prompts"）
 *
 * 两个出口：
 *   buildStyleInstruction  → 英文散文，交给 MITRA 的 style_instruction 字段。
 *                            官方文档说这个字段模型会逐字照读，所以要写成
 *                            对人类译者说话的口气，而不是标签。
 *   buildStyleDirectives   → 中文条目，拼进 DeepSeek 的 prompt。
 */

export const STYLE_DIMENSIONS = {
    category: {
        label: '文本类别',
        default: 'canonical',
        options: [
            { value: 'canonical', label: '经藏原典' },
            { value: 'commentary', label: '论疏注释' },
            { value: 'modern', label: '现代开示' }
        ]
    },
    literalness: {
        label: '译法',
        default: 'balanced',
        options: [
            { value: 'literal', label: '严格直译' },
            { value: 'balanced', label: '折中' },
            { value: 'fluent', label: '顺畅意译' }
        ]
    },
    termRendering: {
        label: '术语呈现',
        default: 'gloss',
        options: [
            { value: 'transliterate', label: '音译优先（般若）' },
            { value: 'translate', label: '意译优先（智慧）' },
            { value: 'gloss', label: '首见附原语' }
        ]
    },
    register: {
        label: '语体',
        default: 'general',
        options: [
            { value: 'academic', label: '学术' },
            { value: 'general', label: '通用读者' },
            { value: 'liturgical', label: '课诵庄严' }
        ]
    },
    depth: {
        label: '注释深度',
        default: 'concise',
        options: [
            { value: 'concise', label: '简洁' },
            { value: 'detailed', label: '详注' }
        ]
    }
};

const ENGLISH = {
    category: {
        canonical: 'The source is canonical scripture; keep the formulaic openings, stock epithets and repetitive cadences of the genre rather than compressing them.',
        commentary: 'The source is exegetical commentary; keep the argumentative structure explicit, and preserve the distinction between the lemma being quoted and the commentator\'s own words.',
        modern: 'The source is a modern Dharma talk; render it as spoken teaching, plain and direct.'
    },
    literalness: {
        literal: 'Hyper-literal: preserve every compound and every particle of the original word order that English can bear, and do not smooth anything editorially.',
        balanced: 'Faithful but readable: follow the original closely, smoothing only where a literal rendering would be unintelligible.',
        fluent: 'Fluent and readable modern prose, suitable for a general reader; recast sentence structure freely where that serves clarity.'
    },
    termRendering: {
        transliterate: 'For technical terms prefer the transcribed Indic form (prajñā, śūnyatā, bodhisattva) over an English equivalent.',
        translate: 'For technical terms prefer a plain-language equivalent over a transcription, and use it consistently throughout.',
        gloss: 'On the first occurrence of each technical term, give the translation followed by the original term in parentheses; afterwards use the translation alone.'
    },
    register: {
        academic: 'Academic register, IAST for Indic names and terms, bracketed insertions for anything supplied by the translator.',
        general: 'Neutral contemporary register, accessible to a reader with no background in Buddhist studies.',
        liturgical: 'Elevated liturgical register suitable for recitation aloud, with even cadence and dignified diction.'
    },
    depth: {
        concise: 'Give no explanations beyond the translation itself.',
        detailed: 'Where a term or an allusion would be opaque, add a short parenthetical gloss inline.'
    }
};

const CHINESE = {
    category: {
        canonical: '原文是经藏正典，保留「如是我聞」一类程式化开头、固定称号与重复句式，不要压缩。',
        commentary: '原文是论疏注释，保持论证层次清楚，并区分所引经文与注释者自己的话。',
        modern: '原文是现代开示，按口语开示处理，平实直接。'
    },
    literalness: {
        literal: '严格直译：保留复合词与原文语序，不做文学性润饰。',
        balanced: '忠实而可读：紧贴原文，仅在直译会不知所云处稍作调整。',
        fluent: '顺畅意译：面向一般读者，可自由重组句式以求清楚。'
    },
    termRendering: {
        transliterate: '术语优先用音译形式（般若、波罗蜜、菩提萨埵），不要换成通俗说法。',
        translate: '术语优先用通俗易懂的意译，并全文统一。',
        gloss: '术语首次出现时给出译名并在括号内附原语（如「智慧（prajñā）」），其后只用译名。'
    },
    register: {
        academic: '学术语体，印度语词用 IAST 转写，译者补出的内容放方括号。',
        general: '当代通用语体，面向没有佛学背景的读者。',
        liturgical: '课诵语体，句式庄严整齐，适合出声念诵。'
    },
    depth: {
        concise: '只给译文，不加任何解释。',
        detailed: '遇到会让人看不懂的术语或典故，就地补一句简短括注。'
    }
};

/*
 * 与译风**无关**的保真规则。
 *
 * 第 6 条的由来：2026-08-15 对齐译风后重跑，模型在《雜阿含》婆蹉種火喻的译文末尾
 * 自行附上了一段没人要的学术注（"(The Pali parallel, the Aggivacchagotta Sutta,
 * adds that…)"）——原文没有这句，译风也设了「简洁：只给译文」，第 5 条那句
 * 「原文没有的内容一个字都不要加」没能拦住它。看着权威的自动补注对佛学工具是危险的，
 * 所以单列一条，把「括号里只能放一个词、不能放一句话」写死。
 *
 * 这四条不是风格偏好，是「怎么译都不该错」的东西，所以不做成维度、不给开关，
 * 恒定拼进指令。来源是 2026-08-15 与 foguang.ai 的四段对照：我方赢在术语精确度，
 * 输的四处全部落在这一层——引号层次被拆、人称被改、佛典固定语被意译掉、
 * 数目结构被省、括注挂到了邻词上。详见 docs/competitive-baseline.md。
 *
 * ⚠️ 英文这份**不能出现任何汉字**：style_instruction 由英文侧模型逐字照读，
 * tests/style.test.mjs 有一条断言守着（举例只能用罗马字转写）。
 */
const FIDELITY_EN = [
    'Reproduce the nesting of quoted speech exactly as the source marks it, and keep the grammatical person inside a quotation unchanged: what a speaker says of himself stays in the first person.',
    'Canonical stock phrases have settled English renderings; keep their imagery instead of paraphrasing it away — a phrase meaning "the long night" of transmigration stays a long night, it does not become "for a long time".',
    'Keep numerals that count a doctrinal set ("the two kinds of action", "the five aggregates"); never drop the number.',
    'When you supply an original-language term in parentheses, attach it to the exact word it glosses and to no other word. This governs where a gloss goes, not whether to give one — on that, follow the style setting above.',
    'Give Indic terms in the full form established in Buddhist Sanskrit usage (śikṣāpada, not a bare śikṣā); never invent one by back-forming it from how another witness spells the word, and where no established form exists, give the translation with no parenthesis at all rather than coining one. Add nothing that is not in the source.'
,
    'Output the translation and nothing else. Do not append a note comparing the passage to a parallel in another canon, do not explain what the passage means, and do not mark anything as your own observation — not even inside parentheses. A parenthesis may hold a single term, never a sentence.'
];

const FIDELITY_ZH = [
    '引号层次照原文复现，引语内的人称不要改动：说话人自述的话保持第一人称。',
    '佛典固定语有既定译法，保留其意象，不要意译掉——如「长夜」轮转应保留 the long night 的意象，不要化为「很长时间」。',
    '保留计数式的数目结构（如「二业」「五蕴」），数字不能省。',
    '括注原语时，必须挂在它所解释的那个词上，不要挂到邻近的词——这条管的是位置，不影响该不该加括注，加不加按上面的译风要求。',
    '印度语词一律用佛教梵语既有的完整标准形式（如 śikṣāpada，不要截成 śikṣā），不要照另一路写本的拼法倒推生造；若某词本无确立形式，只给译名、不加括注，不要自造一个。原文没有的内容一个字都不要加。'
,
    '只输出译文。不要在末尾附上与他本（巴利本、藏本等）的比较说明，不要解释文义，不要标注你自己的观察——放在括号里也不行。括号里只能放一个词，不能放一句话。'
];

/*
 * 多写本专用规则。只在实际送入一路以上写本时附加——单本时说这些是噪音。
 *
 * 由来：2026-08-15 的三段 A/B（汉本 vs 汉+藏合参）显示合参确有效
 * （「業」由 kriyā 纠正为 karman、六种作业从压缩改为逐条列出、省略句式借藏文还原为设问），
 * 但同时量出一个稳定的副作用：模型拿到藏文后会**从藏文倒推梵文**——
 * 「鼻」从标准的 ghrāṇa- 变成 nāsa-（藏文 sna），「率爾心」更是造出了 sraṭ-citta 这个不存在的词；
 * 藏文段落跨度超出汉文时还会把多出来的内容一并译进去。
 * 所以合参必须声明底本，不能裸用。详见 docs/competitive-baseline.md。
 */
const MULTI_WITNESS_EN = 'Several witnesses of the same passage are supplied. Translate the passage the primary witness attests; the other witnesses are there only to resolve what the primary one leaves ambiguous. Do not carry over material that only the secondary witnesses contain, and do not derive the spelling of an Indic term from a secondary witness.';

/** 多写本时附加的规则；单本时返回空串。 */
export function multiWitnessRule(witnessCount) {
    return witnessCount > 1 ? MULTI_WITNESS_EN : '';
}

/** 恒定保真规则。与五个译风维度并列，但不随其变化。 */
export function fidelityRules(lang = 'zh') {
    return lang === 'en' ? [...FIDELITY_EN] : [...FIDELITY_ZH];
}

const ORDER = ['literalness', 'termRendering', 'register', 'depth', 'category'];

export function normalizeStyle(style) {
    const normalized = {};
    for (const [key, spec] of Object.entries(STYLE_DIMENSIONS)) {
        const value = style?.[key];
        const allowed = spec.options.some(option => option.value === value);
        normalized[key] = allowed ? value : spec.default;
    }
    return normalized;
}

export function defaultStyle() {
    return normalizeStyle({});
}

/** 英文散文，交给 MITRA 的 style_instruction。保真规则恒定附在译风之后。 */
export function buildStyleInstruction(style) {
    const normalized = normalizeStyle(style);
    return [...ORDER.map(key => ENGLISH[key][normalized[key]]), ...FIDELITY_EN].join(' ');
}

/** 中文条目，拼进 DeepSeek 的 prompt。 */
export function buildStyleDirectives(style) {
    const normalized = normalizeStyle(style);
    return ORDER.map(key => CHINESE[key][normalized[key]]);
}

/** 供界面显示的一行摘要。 */
export function describeStyle(style) {
    const normalized = normalizeStyle(style);
    return ORDER
        .map(key => STYLE_DIMENSIONS[key].options.find(option => option.value === normalized[key])?.label)
        .filter(Boolean)
        .join(' · ');
}
