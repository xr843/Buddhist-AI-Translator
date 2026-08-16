# 致 Dharmamitra 的去信草稿（**未发送**）

收件人：dharmamitra-project@gmail.com
发信人：由 xr843 决定用哪个邮箱
状态：**草稿，等你过目后再发**

两件事合在一封里：v2 的许可问题（对他们是个小 bug 修复），以及集成意向（对他们是好消息）。
先说对他们有用的事，再提问题，这样不像来挑刺的。

---

Subject: MITRA-parallel v2 licence pointer, and a small downstream integration

Dear Dharmamitra team,

I maintain 慧译通 / Buddhist AI Translator
(https://xr843.github.io/Buddhist-AI-Translator/), a small open-source
front-end that uses your `cat-translate` and `primary` endpoints through a
Cloudflare Worker relay. It is free, needs no account, and carries attribution
to MITRA on every page. Thank you for making these available.

Three things, in decreasing order of usefulness to you.

**1. A CORS detail you may not know about.** Browsers cannot call
`dharmamitra.org/api-search/cat-translate/` or `/api-search/primary/` directly:
the actual responses carry `Access-Control-Allow-Origin` twice, so every browser
rejects them with "contains multiple values '*, *'". The preflight OPTIONS sends
it only once, so preflight passes and the failure only shows up on the real
request. `curl` does not validate duplicate CORS headers, so it is invisible from
the command line. We work around it with a relay, but a one-line fix on your side
would let any browser client talk to you directly.

**2. The licence pointer for `mitra-parallel` v2 appears to be broken.**
`v2/README.md` says "License and citation follow the repository root README",
but the root `README.md` has no licence section, and the repository has no
`LICENSE` file (we checked the repository root, `v1/`, and `v2/`). The clear
statement is in `v1/README.md` (CC BY-SA 4.0). We assume v2 is meant to carry the
same terms, but we did not want to assume that on your behalf — so we have marked
v2 as UNVERIFIED in our own NOTICE file rather than restate a licence you have not
stated. Could you confirm what licence applies to v2? A line in the root README
would settle it for everyone downstream.

**3. What we would like to build, if the licence allows.** Your
`cat-translate` accepts several witnesses at once (`input_chinese`,
`input_sanskrit`, `input_tibetan`, `input_pali`). In practice almost nobody can
use this, because a user pasting a Chinese passage does not have the Sanskrit or
Tibetan to hand. We would like to close that gap: look the passage up, retrieve
its aligned Sanskrit/Tibetan segments from MITRA-parallel, and pass all witnesses
to `cat-translate` automatically.

Our first measurements are encouraging — v1 covers 1,208 Chinese Taishō texts and
about 739,000 distinct Chinese segments, and for the major treatises
(Yogācārabhūmi, Nirvāṇa-sūtra, Abhidharmakośa) roughly 40–65% of lines have a
parallel. Two questions:

- Would you be comfortable with this use? We would keep any derived index
  server-side rather than shipping it to browsers, and attribute MITRA-parallel
  under its terms.
- Does `/api-search/primary/` already support cross-language retrieval? We send
  `filter_target_language: "all"` and consistently get same-language results only
  (twelve of twelve Chinese hits even for the Heart Sūtra, which certainly has
  Sanskrit and Tibetan witnesses in your corpus). If there is a parameter we are
  missing, that would save us building an index at all.

Happy to share our measurements, or to contribute the CORS finding as an issue if
that is more useful.

With thanks and respect for the work,
[署名]

---

## 发信前请自行确认

- 用哪个邮箱署名（`git-identity-dco-mismatch` 那条记着：全局 git 邮箱与 OSS 署名邮箱不一致）
- 第 1 条的 CORS 判断，依据是 `CLAUDE.md` 里记的实测方法，你可以自己复跑一遍再发
- 第 3 条透露了产品路线。若不想提前告知，可只发第 1、2 条
