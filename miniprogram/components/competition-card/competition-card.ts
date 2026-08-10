import type { CompetitionListItem } from "../../models/competition";

/**
 * Bounded My Competitions list card (high-level design §10.1, plan §7.1).
 * One primary destination plus at most one Website action. Unknown identity
 * renders as neutral "未就绪" text — never a guessed label.
 */
const FORMAT_LABELS: Record<string, string> = {
  POINTS_TABLE: "积分制",
  KNOCKOUT: "淘汰赛",
  UNKNOWN: "赛制未就绪"
};

const LIFECYCLE_META: Record<string, { label: string; tone: string }> = {
  ACTIVE: { label: "进行中", tone: "tone-good" },
  INACTIVE: { label: "未开始", tone: "tone-muted" },
  FINISHED: { label: "已结束", tone: "tone-muted" },
  UNKNOWN: { label: "状态未就绪", tone: "tone-warn" }
};

Component({
  properties: {
    item: {
      type: Object,
      value: undefined
    }
  },

  data: {
    name: "",
    formatLabel: "",
    lifecycleLabel: "",
    lifecycleTone: "tone-muted",
    metaText: ""
  },

  observers: {
    item: function () {
      const item = this.properties.item as CompetitionListItem | undefined;
      if (!item) {
        return;
      }
      const lifecycle = LIFECYCLE_META[item.lifecycle] || LIFECYCLE_META.UNKNOWN;
      const segments: string[] = [];
      if (item.participantCount !== undefined) {
        segments.push(`${item.participantCount} 人参与`);
      }
      if (item.startedEventId !== undefined && item.endedEventId !== undefined) {
        segments.push(`GW${item.startedEventId}–${item.endedEventId}`);
      }
      this.setData({
        name: item.name,
        formatLabel: FORMAT_LABELS[item.formatHint] || FORMAT_LABELS.UNKNOWN,
        lifecycleLabel: lifecycle.label,
        lifecycleTone: lifecycle.tone,
        metaText: segments.join(" · ")
      });
    }
  },

  methods: {
    onOpen() {
      this.triggerEvent("open");
    },
    onManage() {
      this.triggerEvent("manage");
    }
  }
});
