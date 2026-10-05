// The controls of an item's form, drawn from the view model of ui/form.ts: a text with its counter, a dropdown as
// segmented buttons (or a list), a checkbox, a number, and the «Длительность, с» field with its stepper.
import type { FieldValue } from '../core/types';
import type { Control, DurationControl } from './form';

const Hint = ({ text }: { text: string | undefined }) => (text ? <p class="hint">{text}</p> : null);

export interface FieldRowProps {
  control: Control;
  onChange(key: string, value: FieldValue): void;
}

export function FieldRow({ control: c, onChange }: FieldRowProps) {
  const id = 'fld-' + c.key;
  switch (c.kind) {
    case 'text':
      return (
        <div class="field">
          <div class="label-row">
            <label class="label" for={id}>{c.label}</label>
            <span class={'counter ' + c.level}>{c.counter}</span>
          </div>
          <input
            id={id}
            class="input"
            type="text"
            value={c.value}
            maxLength={c.maxLen > 0 ? c.maxLen : undefined}
            disabled={c.disabled}
            autoComplete="off"
            spellcheck={false}
            onInput={(e) => onChange(c.key, e.currentTarget.value)}
          />
          <Hint text={c.hint} />
        </div>
      );
    case 'segments':
      return (
        <div class="field" role="radiogroup" aria-label={c.label}>
          <div class="label-row"><span class="label">{c.label}</span></div>
          <div class={'segments ' + c.layout}>
            {c.options.map((o) => (
              <button
                key={o.index}
                type="button"
                role="radio"
                aria-checked={o.index === c.value}
                class={'seg' + (o.index === c.value ? ' on' : '')}
                disabled={c.disabled}
                onClick={() => onChange(c.key, o.index)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <Hint text={c.hint} />
        </div>
      );
    case 'select':
      return (
        <div class="field">
          <div class="label-row"><label class="label" for={id}>{c.label}</label></div>
          <select
            id={id}
            class="input"
            value={c.value}
            disabled={c.disabled}
            onChange={(e) => onChange(c.key, Number(e.currentTarget.value))}
          >
            {c.options.map((o) => (
              <option key={o.index} value={o.index} selected={o.index === c.value}>{o.label}</option>
            ))}
          </select>
          <Hint text={c.hint} />
        </div>
      );
    case 'checkbox':
      return (
        <div class="field">
          <label class="check">
            <input
              type="checkbox"
              checked={c.value}
              disabled={c.disabled}
              onChange={(e) => onChange(c.key, e.currentTarget.checked)}
            />
            <span class="check-label">{c.label}</span>
          </label>
          <Hint text={c.hint} />
        </div>
      );
    case 'number':
      return (
        <div class="field">
          <div class="label-row"><label class="label" for={id}>{c.label}</label></div>
          <input
            id={id}
            class="input"
            type="number"
            value={c.value}
            min={c.min}
            max={c.max}
            step={c.step}
            disabled={c.disabled}
            onInput={(e) => {
              const n = e.currentTarget.valueAsNumber;
              if (Number.isFinite(n)) onChange(c.key, n);
            }}
          />
          <Hint text={c.hint} />
        </div>
      );
    default:
      return (
        <div class="field">
          <div class="label-row"><span class="label">{c.label}</span></div>
          <Hint text={c.hint} />
        </div>
      );
  }
}

export interface DurationRowProps {
  duration: DurationControl;
  text: string; // what is typed, which may not be a number yet
  onText(text: string): void;
  onStep(dir: 1 | -1): void;
  onCommit(): void;
}

export function DurationRow({ duration: d, text, onText, onStep, onCommit }: DurationRowProps) {
  return (
    <div class="field">
      <div class="label-row"><label class="label" for="fld-duration">{d.label}</label></div>
      <div class="stepper">
        <button type="button" class="step" aria-label="Короче на кадр" onClick={() => onStep(-1)}>−</button>
        <input
          id="fld-duration"
          class={'input' + (d.tooShort ? ' invalid' : '')}
          type="text"
          inputMode="decimal"
          value={text}
          autoComplete="off"
          aria-invalid={d.tooShort}
          onInput={(e) => onText(e.currentTarget.value)}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommit();
            else if (e.key === 'ArrowUp') {
              e.preventDefault();
              onStep(1);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              onStep(-1);
            }
          }}
        />
        <button type="button" class="step" aria-label="Длиннее на кадр" onClick={() => onStep(1)}>+</button>
      </div>
      <p class={'hint' + (d.tooShort ? ' warn' : '')}>{d.hint}</p>
    </div>
  );
}
