const STATE_META: Record<string, { label: string; tone: string }> = {
  scheduled: { label: "未开始", tone: "muted" },
  fresh: { label: "已更新", tone: "good" },
  refreshing: { label: "刷新中", tone: "busy" },
  delayed: { label: "数据延迟", tone: "warn" },
  partial: { label: "部分数据", tone: "warn" },
  final: { label: "已结算", tone: "muted" },
  offline: { label: "离线 · 上次结果", tone: "warn" },
  unavailable: { label: "暂不可用", tone: "bad" }
};

Component({
  properties: {
    /** LiveDisplayState from utils/live-status. */
    state: {
      type: String,
      value: "fresh"
    },
    /** "HH:MM:SS" of the last successful check, "" when unknown. */
    lastChecked: {
      type: String,
      value: ""
    },
    /** Coverage summary such as "38/40"; only with the shared contract fields. */
    coverageText: {
      type: String,
      value: ""
    },
    /** Retained previous-context rows after a partial merge. */
    retainedCount: {
      type: Number,
      value: 0
    },
    compact: {
      type: Boolean,
      value: false
    }
  },

  data: {
    stateLabel: "已更新",
    toneClass: "tone-good",
    metaText: ""
  },

  observers: {
    "state, lastChecked, coverageText, retainedCount": function () {
      const meta = STATE_META[this.properties.state] || STATE_META.fresh;
      const parts: string[] = [];
      if (this.properties.lastChecked) {
        parts.push(`更新 ${this.properties.lastChecked}`);
      }
      if (this.properties.coverageText) {
        parts.push(this.properties.coverageText);
      }
      if (this.properties.retainedCount > 0) {
        parts.push(`${this.properties.retainedCount} 行未更新`);
      }
      this.setData({
        stateLabel: meta.label,
        toneClass: `tone-${meta.tone}`,
        metaText: parts.join(" · ")
      });
    }
  },

  methods: {
    onRefresh() {
      this.triggerEvent("refresh");
    }
  }
});
