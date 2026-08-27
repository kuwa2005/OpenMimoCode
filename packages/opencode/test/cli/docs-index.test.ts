import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import {
  collectDocs,
  escapeForScript,
  groupOf,
  isPagesDoc,
  renderDocsIndex,
  titleOf,
} from "../../../../script/build-docs-index.ts"

const ROOT = resolve(import.meta.dir, "../../../..")
const DOCS_DIR = resolve(ROOT, "docs")

describe("docs-index (docs ビューア生成)", () => {
  test("T1: collectDocs が docs/ の全 md をソート順で検出する", () => {
    const docs = collectDocs(DOCS_DIR)
    expect(docs.length).toBeGreaterThanOrEqual(60)
    for (const path of [
      "RELEASING.md",
      "compose/specs/release-build-matrix.md",
      "architecture/codex-microkernel-runtime.md",
      "harness/MiMo Orchestrator Mode.md",
    ]) {
      expect(docs).toContain(path)
    }
    const sorted = [...docs].sort()
    expect(docs).toEqual(sorted)
    for (const path of docs) expect(path.endsWith(".md")).toBe(true)
  })

  test("T2: titleOf は frontmatter / H1 / ファイル名の順で抽出する", () => {
    expect(titleOf("---\ntitle: フロントマター題名\n---\n# H1 題名\nbody", "a/b.md")).toBe("フロントマター題名")
    expect(titleOf("# H1 題名\nbody", "a/b.md")).toBe("H1 題名")
    expect(titleOf("body only", "a/b/c.md")).toBe("c")
  })

  test("T3: groupOf はディレクトリ別グループを返す", () => {
    expect(groupOf("RELEASING.md")).toBe("トップ")
    expect(groupOf("compose/specs/x.md")).toBe("specs")
    expect(groupOf("compose/reports/x.md")).toBe("reports")
    expect(groupOf("compose/plans/x.md")).toBe("plans")
    expect(groupOf("compose/spec/x.md")).toBe("spec")
    expect(groupOf("architecture/x.md")).toBe("architecture")
    expect(groupOf("harness/x.md")).toBe("harness")
  })

  test("T4: escapeForScript は </script> を無害化し JSON 往復できる", () => {
    const escaped = escapeForScript("</script><script>alert(1)</script>")
    expect(escaped).not.toContain("</script>")
    expect(escaped).toContain("\\u003c/script")
    expect(JSON.parse(escaped)).toBe("</script><script>alert(1)</script>")
  })

  test("T5: 生成 HTML は manifest 以外に </script> を出現させない", () => {
    const html = renderDocsIndex(
      [{ path: "a/b.md", title: "B", group: "specs", content: "# B\n</script><script>alert(1)</script>" }],
      "/* marked */",
    )
    expect(html).toContain('id="docs-manifest"')
    expect(html).toContain('id="groups"')
    expect(html).toContain('id="content"')
    expect(html).toContain('id="filter"')
    expect(html).toContain("marked.parse")
    expect(html).toContain("querySelectorAll(\"script, iframe")
    expect(html).toContain("oimo-docs-theme")
    expect(html).toContain("\\u003c/script")
    const closingTags = html.split("</script>").length - 1
    expect(closingTags).toBe(3)
  })

  test("T6: renderDocsIndex は決定性を持つ", () => {
    const docs = [{ path: "x.md", title: "X", group: "トップ", content: "# X\nbody" }]
    expect(renderDocsIndex(docs, "src")).toBe(renderDocsIndex(docs, "src"))
  })

  test("T7: E2E — 生成スクリプト実行で index.html が再生成され全文書が manifest に含まれる", async () => {
    const proc = Bun.spawn([process.execPath, "script/build-docs-index.ts"], {
      cwd: ROOT,
      env: process.env,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
    expect(await proc.exited).toBe(0)
    expect(stdout).toContain("docs/index.html generated")
    expect(stderr).toBe("")
    const html = await Bun.file(resolve(DOCS_DIR, "index.html")).text()
    const docs = collectDocs(DOCS_DIR)
    for (const path of docs) {
      expect(html).toContain(path)
    }
    const m = /id="docs-manifest">([\s\S]*?)<\/script>/.exec(html)
    expect(m).not.toBeNull()
    if (m === null) return
    const parsed = JSON.parse(m[1])
    expect(parsed).toHaveLength(docs.length)
    expect(parsed[0].path).toBe("RELEASING.md")
    for (const doc of parsed) {
      expect(doc.title.length).toBeGreaterThan(0)
      expect(doc.group.length).toBeGreaterThan(0)
    }
  })

  test("T8: pages.yml に再生成ステップ、AGENTS.md に参照が記録されている", async () => {
    const pages = await Bun.file(resolve(ROOT, ".github/workflows/pages.yml")).text()
    expect(pages).toContain("build-docs-index.ts")
    expect(pages).toContain("--pages")
    expect(pages).toContain("setup-bun")
    const agents = await Bun.file(resolve(ROOT, "AGENTS.md")).text()
    expect(agents).toContain("build-docs-index.ts")
  })

  test("T9: isPagesDoc は fr/ru と compose 計画成果物を除外する", () => {
    expect(isPagesDoc("RELEASING.md")).toBe(true)
    expect(isPagesDoc("architecture/x.md")).toBe(true)
    expect(isPagesDoc("compose/specs/x.md")).toBe(true)
    expect(isPagesDoc("harness/MiMo Orchestrator Mode.ja.md")).toBe(true)
    expect(isPagesDoc("harness/MiMo Orchestrator Mode.fr.md")).toBe(false)
    expect(isPagesDoc("harness/MiMo Orchestrator Mode.ru.md")).toBe(false)
    expect(isPagesDoc("compose/plans/x.md")).toBe(false)
    expect(isPagesDoc("compose/reports/x.md")).toBe(false)
  })

  test("T10: Pages ビルドは lazy manifest と md/ を出力する", async () => {
    const out = resolve(ROOT, ".artifacts/pages-site-test")
    await Bun.$`rm -rf ${out}`.quiet()
    const proc = Bun.spawn([process.execPath, "script/build-docs-index.ts", "--pages", "--out", out], {
      cwd: ROOT,
      env: process.env,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
    expect(await proc.exited).toBe(0)
    expect(stderr).toBe("")
    expect(stdout).toContain("lazy")
    const html = await Bun.file(resolve(out, "index.html")).text()
    expect(html.length).toBeLessThan(200_000)
    const m = /id="docs-manifest">([\s\S]*?)<\/script>/.exec(html)
    expect(m).not.toBeNull()
    if (m === null) return
    const parsed = JSON.parse(m[1]) as Array<{ path: string; content?: string; contentUrl?: string }>
    expect(parsed.length).toBeGreaterThan(20)
    expect(parsed.every((d) => !d.content && typeof d.contentUrl === "string")).toBe(true)
    expect(parsed.every((d) => isPagesDoc(d.path))).toBe(true)
    const sample = parsed[0]
    expect(await Bun.file(resolve(out, sample.contentUrl!)).exists()).toBe(true)
  })
})
