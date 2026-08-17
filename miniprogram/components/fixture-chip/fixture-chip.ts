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
    fdrClass: ""
  },

  observers: {
    "difficulty, difficultyKnown"(difficulty: number, difficultyKnown: boolean) {
      const value = Math.round(Number(difficulty));
      this.setData({
        fdrClass: difficultyKnown && value >= 1 && value <= 5 ? `fdr-${value}` : ""
      });
    }
  }
});
