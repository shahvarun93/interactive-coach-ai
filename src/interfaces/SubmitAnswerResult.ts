import { SDEvaluation } from "./SDEvaluation";
import { SystemDesignSession } from "./SystemDesignSession";

export interface SubmitAnswerResult {
    session: SystemDesignSession;
    evaluation: SDEvaluation;
}