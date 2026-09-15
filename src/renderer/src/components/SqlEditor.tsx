import CodeMirror from '@uiw/react-codemirror'
import { PostgreSQL, sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'

export function SqlEditor({
  value,
  onChange
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="cm-wrap">
      <CodeMirror
        value={value}
        height="100%"
        theme={oneDark}
        extensions={[sql({ dialect: PostgreSQL, upperCaseKeywords: true })]}
        onChange={onChange}
        basicSetup={{ autocompletion: true, foldGutter: true, highlightActiveLine: true }}
      />
    </div>
  )
}
