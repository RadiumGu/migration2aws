# Azure-to-AWS Skill 审阅报告

> 审阅者：架构审阅猫 | 日期：2026-04-22
> 对象：`/home/ubuntu/tech/migration2aws/azure2aws/` (Phase A 产出，35 个文件)

---

## 【AWS PSA 视角】

整体印象：*这是一个设计扎实的迁移评估 skill*。5-phase workflow 覆盖了从环境发现到执行计划的完整链路，CloudRays + Azure MCP 双源发现模型比单一数据源可靠得多。License guidance 和 Entra ID 策略是 Azure 迁移的两个核心痛点，处理得到位。

### 值得肯定的

- Multi-source discovery（CloudRays + Azure MCP + ARM/Bicep）带降级路径，这是正确的工程决策
- Q9 License 策略 + Q10 Entra ID 策略作为 Azure 特有问题独立抽出，且贯穿 Design/Estimate/Execute 全链路
- `license-guidance.md` 中 Listed Provider 限制的描述准确，成本对比表实用
- Phase routing + state management 设计考虑了 session 中断恢复
- fast-path.md 的 Skip Mappings 避免了对 ARM 内部资源的无意义映射

### ⚠️ 严重问题

1. **`pricing-fallback.json` 缺失但已被引用**
   - SKILL.md Error Handling 明确写了 awspricing 失败时 fall back to `references/shared/pricing-fallback.json`
   - 该文件标记为 Phase D 待做，当前不存在
   - *影响*：Phase 4 (Estimate) 在 awspricing MCP 不可用时会直接断掉，无法降级
   - *建议*：至少放一个包含 Top 20 AWS 服务定价的静态 JSON，后续再完善

2. **`cloudrays-integration.md` 未在 SKILL.md 的 references 路径中声明**
   - discover.md Step 0 引用了它，但 SKILL.md 的目录结构表中没有 `shared/cloudrays-integration.md`
   - *影响*：Kiro CLI 加载 skill 时可能无法正确索引该文件
   - *建议*：在 SKILL.md 的 Phase Summary Table 或 Scope Notes 中补充声明

### ⚡ 中等问题

3. **scan.js 中 file descriptor 竞态风险**
   - `spawn('pwsh', args, { detached: true, stdio: ['ignore', out.fd, err.fd] })` 之后立即 `out.close()` / `err.close()`
   - detached 子进程继承了 fd，父进程 close 后子进程的 fd 仍然有效（Unix fork/exec 语义），所以*实际上没有 bug*
   - 但代码可读性差，建议加注释说明为什么 close 后子进程仍能写入

4. **scan.js 缺少 scan 超时终止逻辑**
   - `child.unref()` 后进程脱离，但没有任何机制在 30 分钟后终止
   - discover.md 写了 "Hard timeout: 30 minutes"，但这个超时只在 agent 端的 polling 策略里
   - *影响*：如果 CloudRays 脚本挂住，会留下僵尸进程
   - *建议*：在 state-manager 中记录 `started_at` + 在 `cloudrays_status` 中检查是否超时，超时则 kill pid

5. **preflight.js 中 `@me` 参数的兼容性**
   - `az role assignment list --assignee @me` 需要 az cli 2.37+
   - 代码没有检查 az cli 版本是否满足此要求
   - *建议*：在 checkAzCli 中解析版本号，低于 2.37 时用 `az ad signed-in-user show` 获取 objectId 后传入

6. **preflight.js 中 Owner/Contributor 的 RBAC 推断过于宽松**
   - `const owner = roleNames.has('owner') || roleNames.has('contributor')` 然后所有角色都返回 true
   - Contributor 实际上没有 `Billing Reader` 和 `Cost Management Reader` 权限
   - *影响*：有 Contributor 角色但没有 billing 权限的用户会被误报为 "all permissions OK"，然后 CloudRays 跑到一半因权限不足失败
   - *建议*：只有 Owner 才隐含全部权限，Contributor 不隐含 billing 权限

7. **output-schema.md 中 `X|Y` 语法易误用**
   - 文档顶部有声明"这是文档简写，不要出现在实际 JSON 中"
   - 但 agent 可能仍然把 `"source": "cloudrays|azure-mcp|merged"` 直接复制到输出
   - *建议*：改用 JSON Schema 标准的 `enum` 写法，或在每个字段旁加 `// enum: [...]` 注释

8. **Design phase 的 region mapping 缺少中国区**
   - SKILL.md Defaults 提到支持 `AzureChinaCloud`，但 design.md Step 1 的 region mapping 表没有 `chinaeast`/`chinanorth` → `cn-north-1`/`cn-northwest-1`
   - *建议*：补充中国区 region mapping（GovCloud 不需要）

### 💡 建议

9. **SKILL.md description 过长**（触发短语列举了 10+ 个变体）
   - Kiro CLI 的 skill matching 可能只用前 200 字符
   - *建议*：精简到核心描述 + 3-4 个关键触发词

10. **缺少 `README.md` 中的快速验证步骤**
    - 开发者拿到代码后没有一个命令可以验证 CloudRays wrapper 是否能启动
    - *建议*：加 `node cloudrays-mcp-wrapper/index.js` + 简单 smoke test 说明

11. **design-refs/fast-path.md 中 Azure Front Door 没有进 fast-path**
    - service-mapping.md 里 Front Door → CloudFront + Global Accelerator + WAF（1→3 拆分），合理地不在 fast-path
    - 但建议在 fast-path.md 底部加个 "Notable exclusions" 表，说明哪些常见服务因为 1→N 映射而需要走 rubric

12. **estimate.md 和 execute.md 的 Step 0 重复了 design.md 的校验逻辑**
    - 每个 phase 都单独写一遍 JSON 校验
    - 可以抽出一个 `shared/validation-helpers.md` 引用
    - 不紧急，但后续维护时容易不一致

13. **CloudRays MCP wrapper 缺少 package-lock.json 和 .nvmrc**
    - `package.json` 存在但没有锁文件
    - *建议*：`npm install` 后提交 `package-lock.json`，加 `.nvmrc` 指定 Node 18+

---

## 【客户 PA 视角】

### 整体评估

作为要落地使用的迁移评估工具，这个 skill 的*方法论是成熟的*。5 个 Phase 的拆分合理，Q1-Q10 覆盖了真实迁移评估中需要澄清的关键决策点。

### 关注点

1. **依赖链过长**：CloudRays(pwsh) + Azure CLI + Azure MCP(npx/uvx) + 7 个 MCP server — 在客户环境里，任何一个依赖装不上都会导致体验断裂。虽然有降级路径，但*全降级后的体验质量没有明确定义*。
   - *建议*：写一个 "Minimum Viable Path" 说明：最少只需 Azure CLI + Azure MCP 就能跑完全部 5 个 Phase（只是少了 metrics 和 consumption）

2. **v1.0 不生成 IaC 代码** — 这意味着产出是一份评估报告，不是可执行的迁移脚本。对于 "直接拿去用" 的期望需要在 README 和 SKILL.md 开头明确管理。

3. **Estimate phase 的定价准确性** — 依赖 awspricing MCP 或 pricing-fallback.json，但 Azure baseline 来自 CloudRays consumption。两个数据源的时间窗口和口径可能不一致（CloudRays 是 31 天，AWS pricing 是 on-demand 当前价），TCO 对比的可信度需要在报告中加 disclaimer。

4. **Execute phase 的 12-14 周 timeline** — 对大型企业合理，但中小企业可能 over-engineering。建议加一个 "Light path"（<50 资源，无 SQL Server/Entra ID 复杂度时，压缩到 6-8 周）。

---

## 【五维权衡分析】

| 维度 | 评估 |
|------|------|
| *可维护性* | ✅ 好。SKILL.md 是 router，具体逻辑在 references/ 里按 phase 拆分，改单个 phase 不影响其他。design-refs/ 按类别拆分也合理。 |
| *可测试性* | ⚠️ 中。CloudRays wrapper 有清晰的 tool 接口可以单独测试，但整体 5-phase 端到端流程目前没有测试方案。Phase B-E 测试还是 TODO。 |
| *可部署性* | ⚠️ 中。依赖 7 个 MCP server，缺少 package-lock.json。客户环境安装步骤需要更清晰的文档。 |
| *可扩展性* | ✅ 好。新增 Azure 服务映射只需改 service-mapping.md + 对应 design-refs。新增 MCP server 只需改 .mcp.json + 对应 phase。 |
| *可用性* | ✅ 好。CloudRays 降级到 Azure MCP only，awspricing 降级到 fallback JSON（虽然文件还不存在），Phase routing 支持断点恢复。 |

*方案在可部署性和可测试性上做了取舍*，换取了可维护性和可扩展性。对于 v1.0 这是合理的，但上线前必须补齐测试和 pricing-fallback.json。

---

## 【共同关注点】

两个视角都认为必须解决：
1. `pricing-fallback.json` 缺失 — 降级路径断裂
2. Contributor RBAC 推断错误 — 会导致用户在 scan 中途失败
3. 端到端测试缺失 — 无法验证 5-phase 完整链路

---

## 【行动建议】（优先级排序）

| 优先级 | 问题 | 建议行动 |
|--------|------|---------|
| *P0* | pricing-fallback.json 缺失 | 创建包含 Top 20 AWS 服务 on-demand 定价的静态 JSON |
| *P0* | Contributor RBAC 误判 | 修改 preflight.js：只有 Owner 隐含全部权限，Contributor 不隐含 billing |
| *P1* | cloudrays-integration.md 未声明 | 在 SKILL.md 目录结构表中补充 |
| *P1* | scan 超时无终止机制 | 在 cloudrays_status 中检查 elapsed time，超 30 分钟 kill pid |
| *P1* | 中国区 region mapping 缺失 | 补充 chinaeast/chinanorth → cn-north-1/cn-northwest-1 |
| *P2* | `@me` 兼容性 | preflight.js 中检查 az cli 版本 |
| *P2* | output-schema `X\|Y` 语法 | 改为 enum 写法 |
| *P2* | package-lock.json 缺失 | npm install 后提交 |
| *P3* | SKILL.md description 精简 | 缩减到 200 字符以内 |
| *P3* | 端到端测试方案 | 规划 Phase B 测试（实现文档路线图中已有） |
