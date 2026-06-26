import type { AiModelInfo } from '../../core/ai/types'
import type { DropdownOption } from './Dropdown'

export function modelOptionLabel(model: AiModelInfo): string {
  return model.label ? `${model.label} (${model.id})` : model.id
}

/** Build dropdown rows from provider models, skipping duplicate ids. */
export function modelDropdownOptions(models: AiModelInfo[]): DropdownOption[] {
  const seen = new Set<string>()
  const options: DropdownOption[] = []
  for (const model of models) {
    if (seen.has(model.id)) continue
    seen.add(model.id)
    options.push({ value: model.id, label: modelOptionLabel(model) })
  }
  return options
}
