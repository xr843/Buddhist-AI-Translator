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

/** 英文散文，交给 MITRA 的 style_instruction。 */
export function buildStyleInstruction(style) {
    const normalized = normalizeStyle(style);
    return ORDER.map(key => ENGLISH[key][normalized[key]]).join(' ');
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
