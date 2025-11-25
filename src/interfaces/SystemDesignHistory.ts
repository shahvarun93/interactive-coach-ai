export interface SystemDesignHistoryItem {
  id: string;
  topic: string;
  question: string;
  answerPreview: string | null;
  score: number | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface SystemDesignHistoryPage {
  userId: string;
  total: number;
  page: number;
  pageSize: number;
  items: SystemDesignHistoryItem[];
}
