import QuestionField from './QuestionField'
import { isVisible, type Answers, type Question } from '../../lib/questionnaire'

const WIDE = new Set(['multi', 'tags', 'location', 'yesno'])

interface QuestionFormProps {
  questions: Question[]
  answers: Answers
  onChange: (id: string, value: unknown) => void
  flagMissing?: boolean
  // Show section headings (used for the long "complete later" forms).
  sections?: boolean
}

export default function QuestionForm({ questions, answers, onChange, flagMissing, sections }: QuestionFormProps) {
  const visible = questions.filter(q => isVisible(q, answers))
  const groups: { title: string; items: Question[] }[] = []
  for (const q of visible) {
    const title = sections ? q.section : ''
    const g = groups.find(x => x.title === title)
    if (g) g.items.push(q)
    else groups.push({ title, items: [q] })
  }

  return (
    <div className="space-y-7">
      {groups.map(g => (
        <div key={g.title || 'all'}>
          {g.title && (
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-4" style={{ color: '#64748B' }}>{g.title}</div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-5">
            {g.items.map(q => (
              <div key={q.id} className={WIDE.has(q.type) || q.type === 'text' && q.id === 'description' ? 'md:col-span-2' : ''}>
                <QuestionField question={q} value={answers[q.id]} onChange={v => onChange(q.id, v)} flagMissing={flagMissing} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
