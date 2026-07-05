# 贡献指南 🤝

感谢您对慧译通 - 佛教AI翻译器项目的关注！我们欢迎各种形式的贡献，无论是代码改进、文档完善，还是问题反馈。

## 🌟 如何贡献

### 报告问题
- 优先使用 `.github/ISSUE_TEMPLATE/bug_report.md` 中的 Bug report 模板
- 使用清晰的标题描述问题
- 提供详细的重现步骤
- 包含错误截图或日志（如有）
- 说明您的操作系统和浏览器版本

### 功能建议
- 描述您希望增加的功能
- 解释为什么这个功能对用户有帮助
- 如可能，提供具体的使用场景

### 代码贡献

#### 开发环境设置
```bash
# 1. Fork 项目并克隆到本地
git clone https://github.com/YOUR_USERNAME/Buddhist-AI-Translator.git
cd Buddhist-AI-Translator

# 2. 创建功能分支
git checkout -b feature/your-feature-name

# 3. 启动本地静态服务器
python3 -m http.server 8000
# 访问 http://127.0.0.1:8000/

# 4. 运行检查
npm run verify

# 5. 提交更改
git add .
git commit -m "feat: 添加新功能描述"

# 6. 推送到您的分支
git push origin feature/your-feature-name

# 7. 创建 Pull Request
```

#### 代码规范
- 使用有意义的变量名和函数名
- 添加适当的注释，特别是复杂逻辑
- 保持代码简洁和可读性
- 测试您的更改在不同浏览器中的兼容性

### 文档贡献
- 改进现有文档的清晰度
- 添加使用示例和教程
- 翻译文档到其他语言
- 更正拼写和语法错误

### 术语库贡献
我们特别欢迎佛教术语和翻译的贡献：

#### 术语格式
术语位于 `src/terms.json`。新增或修改术语时保持 JSON 格式有效：

```json
{
  "基础概念": {
    "无常": "impermanence / अनित्य",
    "无我": "non-self / अनात्मन्"
  }
}
```

#### 术语贡献指南
- 优先使用 `.github/ISSUE_TEMPLATE/terminology.md` 中的 Terminology contribution 模板
- 确保术语的准确性和权威性
- 提供多语言对照翻译
- 添加简短的解释或上下文
- 引用权威佛教文献来源

## 🏆 贡献者认可

我们会在项目中公开感谢所有贡献者：

### 代码贡献者
- 在 README 中列出主要贡献者
- 在 GitHub Contributors 页面显示

### 术语库贡献者
- 在术语数据库中标注贡献者
- 特别感谢佛学专家的学术贡献

### 文档贡献者
- 在相关文档页面标注作者
- 感谢翻译和本地化工作

## 📋 Pull Request 指南

### 提交前检查清单
- [ ] 代码遵循项目的编码规范
- [ ] 已测试新功能或修复的bug
- [ ] 已运行 `npm run verify`
- [ ] 更新了相关文档
- [ ] 提交信息清晰明了
- [ ] 没有引入新的console.log或调试代码

### 模板位置
请使用 `.github/pull_request_template.md` 中维护的 Pull Request 模板，并在
Test Plan 中保留实际运行过的验证命令。

## 🤝 社区行为准则

请遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) 中的社区行为准则。

## 📞 联系方式

如有任何问题或建议，请通过以下方式联系：

- **GitHub Issues**: [提交问题](https://github.com/xr843/Buddhist-AI-Translator/issues)

## 🙏 致谢

感谢所有为佛教AI翻译器项目做出贡献的朋友们。您的每一份贡献都在帮助佛法的传播和学术研究的进步。

---

**愿以此功德，回向法界。愿正法久住，利乐有情。** 🙏
