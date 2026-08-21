import { createMemo, onMount } from "solid-js"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useDialog } from "@tui/ui/dialog"
import { useSDK } from "@tui/context/sdk"
import { useSync } from "@tui/context/sync"
import { useTheme } from "@tui/context/theme"
import { useToast } from "@tui/ui/toast"
import { DialogPrompt } from "@tui/ui/dialog-prompt"
import { useLanguage } from "@tui/context/language"
import { FREE_SETUP_PROVIDERS, type FreeSetupProvider } from "@/provider/auto-free/setup-providers"
import { Link } from "@tui/ui/link"
import open from "open"

function isConnected(sync: ReturnType<typeof useSync>, providerID: string) {
  return (
    sync.data.provider_next.connected.includes(providerID) ||
    sync.data.provider_next.authenticated.includes(providerID)
  )
}

/**
 * Guided setup for free-tier providers that need a website account + API key.
 * Zen free models work without this; this unlocks OpenRouter / NIM / Groq etc.
 */
export function DialogAutoFreeSetup() {
  const dialog = useDialog()
  const sync = useSync()
  const { theme } = useTheme()
  const t = useLanguage().t

  const options = createMemo(() => {
    const rows = FREE_SETUP_PROVIDERS.map((provider) => {
      const connected = isConnected(sync, provider.id)
      return {
        title: provider.name,
        value: provider.id,
        description: connected
          ? t("tui.dialog.auto_free_setup.connected")
          : t("tui.dialog.auto_free_setup.needs_key"),
        category: t("tui.dialog.auto_free_setup.category"),
        footer: connected ? "✓" : undefined,
        gutter: connected ? <text fg={theme.success}>✓</text> : undefined,
        onSelect() {
          dialog.replace(() => <DialogAutoFreeProvider provider={provider} />)
        },
      }
    })
    return [
      ...rows,
      {
        title: t("tui.dialog.auto_free_setup.done"),
        value: "__done__",
        description: t("tui.dialog.auto_free_setup.done_desc"),
        category: t("tui.dialog.auto_free_setup.category"),
        footer: undefined,
        gutter: undefined,
        onSelect() {
          dialog.clear()
        },
      },
    ]
  })

  return (
    <DialogSelect
      title={t("tui.dialog.auto_free_setup.title")}
      options={options()}
      hint={t("tui.dialog.auto_free_setup.hint")}
    />
  )
}

function DialogAutoFreeProvider(props: { provider: FreeSetupProvider }) {
  const dialog = useDialog()
  const sdk = useSDK()
  const sync = useSync()
  const toast = useToast()
  const { theme } = useTheme()
  const t = useLanguage().t
  const provider = props.provider

  onMount(() => {
    void open(provider.signupUrl).catch(() => {})
  })

  return (
    <DialogPrompt
      title={t("tui.dialog.auto_free_setup.key_title", { name: provider.name })}
      placeholder={provider.envHint ?? "API key"}
      description={
        <box gap={1}>
          <text fg={theme.textMuted}>{provider.blurb}</text>
          <text fg={theme.text}>
            {t("tui.dialog.auto_free_setup.open_signup")} <Link href={provider.signupUrl} fg={theme.primary} />
          </text>
          <text fg={theme.textMuted}>{t("tui.dialog.auto_free_setup.paste_key")}</text>
        </box>
      }
      onConfirm={async (value) => {
        const key = value?.trim()
        if (!key) return
        const authRes = await sdk.client.auth.set({
          providerID: provider.id,
          auth: { type: "api", key },
        })
        if (authRes.error) {
          toast.show({ variant: "error", message: JSON.stringify(authRes.error) })
          return
        }
        await sdk.client.instance.dispose()
        await sync.bootstrap()
        toast.show({
          variant: "info",
          message: t("tui.dialog.auto_free_setup.saved", { name: provider.name }),
        })
        dialog.replace(() => <DialogAutoFreeSetup />)
      }}
    />
  )
}
