import type { MyFplPhase, MyFplTeamBrief } from "../../models/my-fpl";
import type { MyFplPrincipalState } from "../../models/principal";

interface PhaseMeta {
  title: string;
  description: string;
  primaryLabel: string;
}

/**
 * Phase-led primary card for the My FPL overview (high-level design §7.1,
 * plan §7.1). One leading card — never an equal-weight metric dashboard.
 * NO_FOLLOW and OFFLINE_CACHED override the phase content.
 */
const PHASE_META: Record<MyFplPhase, PhaseMeta> = {
  PRESEASON: {
    title: "新赛季未开始",
    description: "赛季尚未开始，阵容与联赛数据将在开赛后更新",
    primaryLabel: "查看球队"
  },
  PRE_DEADLINE: {
    title: "本轮截止前",
    description: "展示最近已冻结的公开阵容信息；截止前的私人调整以官方为准",
    primaryLabel: "查看球队"
  },
  LIVE: {
    title: "比赛进行中",
    description: "本轮正在进行，实时得分请前往实时球队",
    primaryLabel: "去实时球队"
  },
  SETTLING: {
    title: "结算处理中",
    description: "本轮结果正在结算，最终结果确认前不展示最终数据",
    primaryLabel: "查看球队"
  },
  SETTLED: {
    title: "本轮已结算",
    description: "本轮最终结果已确认",
    primaryLabel: "查看球队复盘"
  },
  OFFSEASON: {
    title: "赛季已结束",
    description: "本赛季已结束，可回顾历史赛季数据",
    primaryLabel: "查看球队"
  }
};

function formatRank(rank: number): string {
  return rank >= 10000 ? `${Math.round(rank / 1000)}k` : String(rank);
}

Component({
  properties: {
    phase: {
      type: String,
      value: "PRE_DEADLINE"
    },
    principalState: {
      type: String,
      value: "READY"
    },
    /** Formatted deadline text, "" when unknown. */
    deadlineText: {
      type: String,
      value: ""
    },
    teamBrief: {
      type: Object,
      value: undefined
    },
    /** Visible offline badge on cached content. */
    offline: {
      type: Boolean,
      value: false
    }
  },

  data: {
    title: "",
    description: "",
    primaryLabel: "",
    secondaryLabel: "",
    metricsText: "",
    showSecondary: false
  },

  observers: {
    "phase, principalState, deadlineText, teamBrief, offline": function () {
      const principalState = this.properties.principalState as MyFplPrincipalState;
      const brief = (this.properties.teamBrief as MyFplTeamBrief | undefined) ?? null;

      if (principalState === "NO_FOLLOW") {
        this.setData({
          title: "先选择我的球队",
          description: "设置我的球队后，这里会展示与你最相关的赛季动态；也可以选择账号同步网页版设置",
          primaryLabel: "去选择球队",
          secondaryLabel: "账号同步",
          metricsText: "",
          showSecondary: true
        });
        return;
      }

      const meta = PHASE_META[this.properties.phase as MyFplPhase] || PHASE_META.PRE_DEADLINE;
      const segments: string[] = [];
      if (this.properties.deadlineText && this.properties.phase === "PRE_DEADLINE") {
        segments.push(`截止 ${this.properties.deadlineText}`);
      }
      if (brief) {
        if (brief.eventPoints !== undefined) segments.push(`本轮 ${brief.eventPoints}`);
        if (brief.overallPoints !== undefined) segments.push(`总分 ${brief.overallPoints}`);
        if (brief.overallRank !== undefined) segments.push(`排名 ${formatRank(brief.overallRank)}`);
      }
      const offline = this.properties.offline || principalState === "OFFLINE_CACHED";
      this.setData({
        title: meta.title + (offline ? " · 离线" : ""),
        description: brief?.entryName ? `${brief.entryName} · ${meta.description}` : meta.description,
        primaryLabel: meta.primaryLabel,
        secondaryLabel: "",
        metricsText: segments.join(" · "),
        showSecondary: false
      });
    }
  },

  methods: {
    onPrimary() {
      this.triggerEvent("primary", { phase: this.properties.phase });
    },
    onSecondary() {
      this.triggerEvent("secondary");
    }
  }
});
