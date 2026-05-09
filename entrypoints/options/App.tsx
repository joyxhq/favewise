import { Sparkles, ArrowRight } from 'lucide-react'
import { Button } from '~/shared/components/ui/button'
import { useT } from '~/shared/lib/i18n'
import { openPrimaryPanel } from '~/shared/lib/webext'

export default function OptionsApp() {
  const { t } = useT()

  const openSidePanel = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    await openPrimaryPanel(tab?.id)
  }

  return (
    <div className="min-h-screen bg-[var(--fw-bg)] text-[var(--fw-text)] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-[var(--fw-surface)] rounded-[var(--fw-radius-xl)] border border-[var(--fw-border)] p-8 shadow-[var(--fw-shadow-md)]">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-[var(--fw-radius-md)] bg-[var(--fw-accent)] flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-[var(--fw-accent-fg)]" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">{t('app.name')}</h1>
            <p className="text-xs text-[var(--fw-text-muted)] leading-tight">
              {t('options.subtitle')}
            </p>
          </div>
        </div>

        <p className="text-xs text-[var(--fw-text-muted)] leading-relaxed mb-5">
          {t('options.body')}
        </p>

        <Button onClick={openSidePanel} size="lg" className="w-full gap-1.5">
          {t('options.openSidePanel')}
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
