import { useState } from 'react'
import {
  BookMarked,
  ShieldCheck,
  Cpu,
  Sparkles,
  ArrowRight,
  Check,
} from 'lucide-react'
import { useT } from '~/shared/lib/i18n'
import type { LucideIcon } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from '~/shared/components/ui/alert-dialog'
import { Button } from '~/shared/components/ui/button'
import { IconBox } from './IconBox'
import { cn } from '~/shared/lib/utils'
import { status, type StatusKey } from '~/shared/lib/tokens'

interface Step {
  Icon: LucideIcon
  tone: StatusKey
  titleKey: string
  bodyKey: string
}

const STEPS: Step[] = [
  { Icon: BookMarked,  tone: 'accent',  titleKey: 'onboarding.step1.title', bodyKey: 'onboarding.step1.body' },
  { Icon: ShieldCheck, tone: 'success', titleKey: 'onboarding.step2.title', bodyKey: 'onboarding.step2.body' },
  { Icon: Cpu,         tone: 'violet',  titleKey: 'onboarding.step3.title', bodyKey: 'onboarding.step3.body' },
  { Icon: Sparkles,    tone: 'warning', titleKey: 'onboarding.step4.title', bodyKey: 'onboarding.step4.body' },
]

interface Props {
  open: boolean
  onFinish: () => void
}

export function OnboardingDialog({ open, onFinish }: Props) {
  const { t } = useT()
  const [step, setStep] = useState(0)
  const current = STEPS[step]!
  const isLast = step === STEPS.length - 1

  const next = () => {
    if (isLast) onFinish()
    else setStep((s) => s + 1)
  }

  const skip = () => onFinish()

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) skip() }}>
      <AlertDialogContent className="max-w-[380px] p-0 overflow-hidden">
        <div className="px-5 pt-6 pb-4 flex flex-col items-center text-center">
          <IconBox Icon={current.Icon} tone={current.tone} size="lg" className="mb-3" />
          <AlertDialogTitle className="text-base font-bold text-[var(--fw-text)] mb-1.5">
            {t(current.titleKey)}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs text-[var(--fw-text-muted)] leading-relaxed">
            {t(current.bodyKey)}
          </AlertDialogDescription>
        </div>

        {/* Step dots */}
        <div className="flex justify-center gap-1 pb-3">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              aria-label={t('common.goToStep', { step: i + 1 })}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === step
                  ? cn('w-6', status.accent.icon.replace('text-', 'bg-'))
                  : 'w-1.5 bg-[var(--fw-border-strong)]',
              )}
            />
          ))}
        </div>

        <div className="border-t border-[var(--fw-border)] px-4 py-3 flex items-center justify-between gap-2 bg-[var(--fw-bg-subtle)]">
          <Button
            variant="ghost"
            size="sm"
            onClick={skip}
            className="text-[11px]"
          >
            {t('common.skip')}
          </Button>
          <div className="flex items-center gap-1.5">
            <span className="text-[10.5px] text-[var(--fw-text-subtle)] tabular-nums">
              {step + 1} / {STEPS.length}
            </span>
            <Button size="sm" onClick={next} className="gap-1 h-7 px-3">
              {isLast ? (
                <>
                  <Check className="h-3 w-3" />
                  {t('common.gotIt')}
                </>
              ) : (
                <>
                  {t('common.next')}
                  <ArrowRight className="h-3 w-3" />
                </>
              )}
            </Button>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
