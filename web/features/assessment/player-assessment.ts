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

const pickleballAnswers = {
  q1: [
    "Mới tập, thường đánh hụt hoặc bóng đi sai hướng",
    "Đánh qua lưới được nhưng chưa kiểm soát tốt",
    "Đánh được ở tốc độ vừa phải nhưng chưa ổn định",
    "Đánh khá ổn trong đa số tình huống",
    "Kiểm soát tốt hướng bóng và lực đánh",
    "Có thể thay đổi lực đánh, tốc độ và điểm rơi",
    "Đánh chính xác, có mục đích rõ khi thi đấu",
    "Có khả năng thi đấu ở trình độ rất cao/chuyên nghiệp",
  ],
  q2: [
    "Hầu như không dùng được",
    "Dùng được nhưng rất yếu và dễ lỗi",
    "Đánh được cơ bản nhưng chưa ổn định",
    "Đánh tương đối ổn trong tình huống đơn giản",
    "Kiểm soát khá tốt hướng bóng và lực đánh",
    "Có thể xử lý nhiều kiểu bóng khác nhau",
    "Đánh ổn định, chính xác trong thi đấu",
    "Có khả năng thi đấu ở trình độ rất cao/chuyên nghiệp",
  ],
  q3: [
    "Chưa biết hoặc rất ít khi thực hiện",
    "Thực hiện được nhưng bóng thường quá cao hoặc lỗi",
    "Đánh được vài pha ngắn nhưng chưa giữ bóng lâu",
    "Có thể duy trì qua lại gần lưới ở mức cơ bản",
    "Biết đánh nhẹ, giữ bóng thấp và hạn chế lỗi",
    "Biết dùng cú đánh nhẹ để tạo lợi thế",
    "Kiên nhẫn, kiểm soát tốt các pha bóng gần lưới",
    "Xử lý bóng gần lưới ở trình độ rất cao/chuyên nghiệp",
  ],
  q4: [
    "Chưa biết cách thực hiện",
    "Biết nhưng thường đánh lỗi hoặc bóng quá cao",
    "Đôi lúc thực hiện thành công",
    "Có thể dùng để đưa bóng qua và tiến lên lưới",
    "Biết chọn lúc đánh nhẹ hoặc đánh mạnh tùy tình huống",
    "Thực hiện khá ổn định và có mục đích rõ ràng",
    "Thành thạo cả bên thuận tay và không thuận tay",
    "Thực hiện ở trình độ rất cao/chuyên nghiệp",
  ],
  q5: [
    "Chủ yếu đánh cho qua lưới, chưa có chiến thuật",
    "Đánh theo phản xạ, chưa biết chọn vị trí",
    "Hiểu cơ bản mình nên đứng đâu và di chuyển thế nào",
    "Biết chọn vị trí hợp lý khi đánh đôi hoặc đánh đơn",
    "Biết phối hợp với đồng đội và tạo khoảng trống trên sân",
    "Biết quan sát điểm yếu của đối thủ để khai thác",
    "Có thể thay đổi cách chơi tùy đối thủ và tình huống trận",
    "Có khả năng thi đấu chiến thuật ở trình độ rất cao/chuyên nghiệp",
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
      {
        id: "q1",
        text: "Bạn đã chơi cầu lông bao lâu?",
        answers: answerSet(badmintonAnswers.q1),
      },
      {
        id: "q2",
        text: "Mức độ kiểm soát đường cầu của bạn?",
        answers: answerSet(badmintonAnswers.q2),
      },
      {
        id: "q3",
        text: "Bạn thực hiện được những kỹ thuật nào?",
        answers: answerSet(badmintonAnswers.q3),
      },
      {
        id: "q4",
        text: "Bạn xây dựng chiến thuật khi thi đấu như thế nào?",
        answers: answerSet(badmintonAnswers.q4),
      },
      {
        id: "q5",
        text: "Bạn tham gia thi đấu ở mức nào?",
        answers: answerSet(badmintonAnswers.q5),
      },
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
  {
    sport: "pickleball",
    title: "Pickleball",
    description:
      "Mỗi câu trả lời được chấm từ 1-8 điểm theo đáp án A-H trong Bộ câu hỏi.",
    questions: [
      {
        id: "q1",
        text: "Khả năng đánh bóng bằng tay thuận của bạn như thế nào?",
        answers: answerSet(pickleballAnswers.q1),
      },
      {
        id: "q2",
        text: "Khả năng đánh bóng bằng tay trái / bên không thuận của bạn như thế nào?",
        answers: answerSet(pickleballAnswers.q2),
      },
      {
        id: "q3",
        text: "Khả năng đánh bóng nhẹ gần lưới của bạn như thế nào?",
        answers: answerSet(pickleballAnswers.q3),
      },
      {
        id: "q4",
        text: "Khả năng xử lý cú đánh quan trọng để tiến lên lưới của bạn như thế nào?",
        answers: answerSet(pickleballAnswers.q4),
      },
      {
        id: "q5",
        text: "Khi chơi trận, bạn thường xử lý chiến thuật như thế nào?",
        answers: answerSet(pickleballAnswers.q5),
      },
    ],
    ranges: [
      { min: 5, max: 10, label: "Level 1.0-2.0", bucket: "beginner" },
      { min: 11, max: 15, label: "Level 2.5", bucket: "beginner" },
      { min: 16, max: 20, label: "Level 3.0", bucket: "intermediate" },
      { min: 21, max: 25, label: "Level 3.5", bucket: "intermediate" },
      { min: 26, max: 30, label: "Level 4.0", bucket: "intermediate" },
      { min: 31, max: 35, label: "Level 4.5", bucket: "advanced" },
      { min: 36, max: 39, label: "Level 5.0", bucket: "advanced" },
      { min: 40, max: 40, label: "Level 5.5+", bucket: "advanced" },
    ],
  },
]

export function calculateAssessmentResult(
  definition: AssessmentDefinition,
  answers: Record<string, string>
): SportAssessmentResult {
  const score = definition.questions.reduce((total, question) => {
    const selected = question.answers.find(
      (answer) => answer.key === answers[question.id]
    )
    return total + (selected?.score ?? 0)
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
    ? (assessment.selectedSports as AssessmentSport[])
    : (["badminton", "pickleball"] as AssessmentSport[])

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
    return definition.questions.every(
      (question) =>
        typeof result.answers?.[question.id] === "string" &&
        question.answers.some((answer) => answer.key === result.answers[question.id])
    )
  })
}

export function readStoredAssessment(): PlayerAssessment | null {
  try {
    const raw = window.localStorage.getItem(PLAYER_ASSESSMENT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PlayerAssessment>
    if (!isCompleteAssessment(parsed)) return null
    if (!parsed.selectedSports) {
      parsed.selectedSports = ["badminton", "pickleball"]
    }
    return parsed as PlayerAssessment
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
    pickleball: levelForSport(assessment, "pickleball", fallback),
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
  const index = definition.ranges.findIndex((r) => score >= r.min && score <= r.max)
  return index !== -1 ? index : 0
}
