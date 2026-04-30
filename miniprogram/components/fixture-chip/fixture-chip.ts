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
    homeAway: {
      type: String,
      value: ""
    }
  },

  data: {
    difficultyClass: "difficulty-easy"
  },

  observers: {
    difficulty(value: number) {
      this.setData({ difficultyClass: getDifficultyClass(value) });
    }
  }
});
