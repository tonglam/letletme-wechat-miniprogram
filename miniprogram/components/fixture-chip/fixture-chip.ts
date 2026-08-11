import { getDifficultyClass } from "../../utils/fpl";

Component({
  properties: {
    opponent: {
      type: String,
      value: ""
    },
    difficulty: {
      type: Number,
      value: 0
    },
    difficultyKnown: {
      type: Boolean,
      value: false
    },
    homeAway: {
      type: String,
      value: ""
    }
  },

  data: {
    difficultyClass: "difficulty-unknown"
  },

  observers: {
    "difficulty, difficultyKnown"(value: number, known: boolean) {
      this.setData({ difficultyClass: getDifficultyClass(known ? value : undefined) });
    }
  }
});
