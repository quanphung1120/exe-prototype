import type { Level } from "@/features/dashboard/data"
import type {
  AssessmentSport,
  SportAssessmentResult,
  PlayerAssessment,
} from "@/lib/shared"

// The persisted assessment shapes now live in @/lib/shared (so the API can
// persist them too); re-export them here to keep existing feature imports stable.
export type { AssessmentSport, SportAssessmentResult, PlayerAssessment }

export interface AssessmentAnswer {
  key: string
  score: number
  text: string
}

export interface AssessmentQuestion {
  id: string
  text: string
  answers: AssessmentAnswer[]
  /**
   * "Which ... (những ...)" questions take several answers. The stored value is
   * the chosen keys joined by "," (e.g. "B,C"); a single-choice answer is just
   * its key, so previously saved assessments stay valid.
   */
  multiple?: boolean
}

/** Questions phrased "những …" ask for every option that applies. */
const isMultipleChoice = (text: string) => /(^|\s)những(\s|$)/i.test(text)

/** The answer keys inside a stored answer ("B,C" → ["B", "C"]). */
export const answerKeys = (value: string | undefined): string[] =>
  value ? value.split(",").filter(Boolean) : []

function question(
  id: string,
  text: string,
  items: readonly string[]
): AssessmentQuestion {
  return {
    id,
    text,
    answers: answerSet(items),
    multiple: isMultipleChoice(text),
  }
}

export interface AssessmentRange {
  min: number
  max: number
  label: string
  bucket: Level
}

export interface AssessmentDefinition {
  sport: AssessmentSport
  title: string
  description: string
  questions: AssessmentQuestion[]
  ranges: AssessmentRange[]
}

export const PLAYER_ASSESSMENT_STORAGE_KEY = "sportmatch.playerAssessment.v1"
export const PLAYER_ASSESSMENT_UPDATED_EVENT = "player-assessment-updated"

// The dedicated route hosting the assessment wizard. The gate redirects
// incomplete players here, and "redo" sends them back to it.
export const PLAYER_ASSESSMENT_PATH = "/assessment"

const badmintonAnswers = {
  q1: [
    "Dưới 3 tháng",
    "3 tháng - 1 năm",
    "1 - 2 năm",
    "Trên 2 năm và tập thường xuyên",
    "Trên 5 năm, tập cường độ cao",
    "Đang/đã thi đấu chuyên nghiệp",
  ],
  q2: [
    "Thường đánh lệch, hụt cầu",
    "Có ý đồ nhưng cầu chưa đi đúng mong muốn",
    "Đa số đường cầu đúng ý",
    "Kiểm soát tốt lực và điểm rơi",
    "Điều chỉnh tốc độ, độ xoáy linh hoạt",
    "Kiểm soát hoàn toàn trong thi đấu",
  ],
  q3: [
    "Chỉ đánh qua lưới",
    "Phông, bỏ nhỏ cơ bản",
    "Đập, lốp, phản tạt cơ bản",
    "Thành thạo đa số kỹ thuật",
    "Có kỹ thuật sở trường riêng",
    "Sử dụng kỹ thuật ở cấp độ thi đấu chuyên nghiệp",
  ],
  q4: [
    "Không có chiến thuật",
    "Chỉ đánh theo phản xạ",
    "Có ý đồ nhưng chưa ổn định",
    "Biết chuẩn bị cho cú đánh tiếp theo",
    "Thường xuyên khai thác điểm yếu đối thủ",
    "Thay đổi chiến thuật linh hoạt trong trận",
  ],
  q5: [
    "Chỉ chơi giải trí",
    "Giao lưu bạn bè",
    "Giao lưu CLB",
    "Giải phong trào",
    "Giải bán chuyên",
    "Giải chuyên nghiệp",
  ],
} as const

function answerSet(items: readonly string[]): AssessmentAnswer[] {
  return items.map((text, index) => ({
    key: String.fromCharCode(65 + index),
    score: index + 1,
    text,
  }))
}

export const ASSESSMENTS: AssessmentDefinition[] = [
  {
    sport: "badminton",
    title: "Badminton",
    description:
      "Mỗi câu trả lời được chấm từ 1-6 điểm theo đáp án A-F trong Bộ câu hỏi.",
    questions: [
      question("q1", "Bạn đã chơi cầu lông bao lâu?", badmintonAnswers.q1),
      question(
        "q2",
        "Mức độ kiểm soát đường cầu của bạn?",
        badmintonAnswers.q2
      ),
      question(
        "q3",
        "Bạn thực hiện được những kỹ thuật nào?",
        badmintonAnswers.q3
      ),
      question(
        "q4",
        "Bạn xây dựng chiến thuật khi thi đấu như thế nào?",
        badmintonAnswers.q4
      ),
      question("q5", "Bạn tham gia thi đấu ở mức nào?", badmintonAnswers.q5),
    ],
    ranges: [
      { min: 5, max: 10, label: "Yếu", bucket: "beginner" },
      { min: 11, max: 15, label: "Trung bình", bucket: "beginner" },
      { min: 16, max: 20, label: "Khá", bucket: "intermediate" },
      { min: 21, max: 25, label: "Tốt", bucket: "intermediate" },
      { min: 26, max: 28, label: "Bán chuyên", bucket: "advanced" },
      { min: 29, max: 30, label: "Chuyên nghiệp", bucket: "advanced" },
    ],
  },
]

export function calculateAssessmentResult(
  definition: AssessmentDefinition,
  answers: Record<string, string>
): SportAssessmentResult {
  // A multi-answer question counts its best selected answer: a player who
  // can do an advanced technique plainly can do the simpler ones too.
  const score = definition.questions.reduce((total, question) => {
    const keys = answerKeys(answers[question.id])
    const best = question.answers
      .filter((answer) => keys.includes(answer.key))
      .reduce((max, answer) => Math.max(max, answer.score), 0)
    return total + best
  }, 0)
  const range =
    definition.ranges.find((r) => score >= r.min && score <= r.max) ??
    definition.ranges[0]

  return {
    sport: definition.sport,
    score,
    levelLabel: range.label,
    bucket: range.bucket,
    answers,
  }
}

export function isCompleteAssessment(
  value: unknown
): value is PlayerAssessment {
  if (!value || typeof value !== "object") return false
  const assessment = value as Partial<PlayerAssessment>
  if (assessment.version !== 1 || !assessment.results) return false

  const selectedSports = Array.isArray(assessment.selectedSports)
    ? assessment.selectedSports
    : (["badminton"] as AssessmentSport[])

  if (selectedSports.length === 0) return false

  return selectedSports.every((sport) => {
    const definition = ASSESSMENTS.find((a) => a.sport === sport)
    if (!definition) return false
    const result = assessment.results?.[sport]
    if (!result || result.sport !== sport) return false
    if (typeof result.score !== "number") return false
    if (typeof result.levelLabel !== "string") return false
    if (!["beginner", "intermediate", "advanced"].includes(result.bucket))
      return false
    return definition.questions.every((question) => {
      const value = result.answers?.[question.id]
      if (typeof value !== "string") return false
      const keys = answerKeys(value)
      return (
        keys.length > 0 &&
        (question.multiple || keys.length === 1) &&
        keys.every((key) => question.answers.some((a) => a.key === key))
      )
    })
  })
}

export function readStoredAssessment(): PlayerAssessment | null {
  try {
    const raw = window.localStorage.getItem(PLAYER_ASSESSMENT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PlayerAssessment>
    if (!isCompleteAssessment(parsed)) return null
    if (!parsed.selectedSports) {
      parsed.selectedSports = ["badminton"]
    }
    return parsed
  } catch {
    return null
  }
}

export function levelForSport(
  assessment: PlayerAssessment | null,
  sport: AssessmentSport,
  fallback: Level
): Level {
  return assessment?.results?.[sport]?.bucket ?? fallback
}

export function levelsBySport(
  assessment: PlayerAssessment | null,
  fallback: Level
): Record<AssessmentSport, Level> {
  return {
    badminton: levelForSport(assessment, "badminton", fallback),
  }
}

export function writeStoredAssessment(assessment: PlayerAssessment) {
  window.localStorage.setItem(
    PLAYER_ASSESSMENT_STORAGE_KEY,
    JSON.stringify(assessment)
  )
  window.dispatchEvent(new Event(PLAYER_ASSESSMENT_UPDATED_EVENT))
}

export function clearStoredAssessment() {
  window.localStorage.removeItem(PLAYER_ASSESSMENT_STORAGE_KEY)
  window.dispatchEvent(new Event(PLAYER_ASSESSMENT_UPDATED_EVENT))
}

export function getRangeIndex(sport: AssessmentSport, score: number): number {
  const definition = ASSESSMENTS.find((a) => a.sport === sport)
  if (!definition) return 0
  const index = definition.ranges.findIndex(
    (r) => score >= r.min && score <= r.max
  )
  return index !== -1 ? index : 0
}
