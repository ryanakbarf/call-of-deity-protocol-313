/**
 * MissionManager.ts
 * Manages missions, objectives, and progression.
 *
 * Supports localStorage persistence so completing a mission
 * unlocks the next one across sessions.
 *
 * Mission 1 objectives are sequential — each triggers the next:
 *   Phase 1: Reach the compound perimeter  (cross z=10)
 *   Phase 2: Eliminate perimeter guards    (kill 5 enemies in Zone 2)
 *   Phase 3: Plant C4 on the border radar  (reach radar + hold E 3s)
 *   Phase 4: Survive the counter-attack    (3 waves of enemies)
 *   Phase 5: Reach extraction point        (get back to z>25)
 */

interface Mission {
  id: number;
  title: string;
  subtitle: string;
  setting: string;
  objectives: Objective[];
  isActive: boolean;
  isCompleted: boolean;
  isPremium: boolean;
}

interface Objective {
  id: string;
  description: string;
  isCompleted: boolean;
}

/** Persistent save data — only completion flags are stored. */
interface MissionSaveData {
  completedMissions: number[];
}

const SAVE_KEY = 'cod313_mission_progress';

export class MissionManager {
  private missions: Mission[] = [];
  private currentMission: Mission | null = null;

  /** Current sequential phase (0-indexed into objectives). */
  private _currentPhase: number = 0;

  /** Called when all objectives of the current mission are completed. */
  public onComplete: ((mission: Mission) => void) | null = null;

  /** Called when a single objective is completed — passes the objective id. */
  public onObjectiveComplete: ((objectiveId: string) => void) | null = null;

  constructor() {
    this.initMissions();
    this.loadProgress();
  }

  private initMissions(): void {
    this.missions = [
      // ──────────────────────────────────────────────
      // FREE MISSIONS
      // ──────────────────────────────────────────────
      {
        id: 1,
        title: 'Desert Dawn',
        subtitle: 'Operation: Border Sabotage',
        setting: 'Sector 313 — Zion Border Wall, 04:45 AM',
        objectives: [
          { id: 'obj_1_1', description: 'Reach the compound perimeter', isCompleted: false },
          { id: 'obj_1_2', description: 'Eliminate perimeter guards (0/5)', isCompleted: false },
          { id: 'obj_1_3', description: 'Plant C4 on the border radar', isCompleted: false },
          { id: 'obj_1_4', description: 'Survive the counter-attack (Wave 0/3)', isCompleted: false },
          { id: 'obj_1_5', description: 'Reach extraction point', isCompleted: false },
        ],
        isActive: false,
        isCompleted: false,
        isPremium: false,
      },
      {
        id: 2,
        title: 'Iron Rain',
        subtitle: 'Urban Warfare',
        setting: 'Eastern district — border town weapons cache, pre-dawn',
        objectives: [
          { id: 'obj_2_1', description: 'Infiltrate the eastern district', isCompleted: false },
          { id: 'obj_2_2', description: 'Clear market enemies (0/8)', isCompleted: false },
          { id: 'obj_2_3', description: 'Secure the rooftop & reach server', isCompleted: false },
          { id: 'obj_2_4', description: 'Download intel from server (hold E, 5s)', isCompleted: false },
          { id: 'obj_2_5', description: 'Defend the cache (Wave 0/3)', isCompleted: false },
          { id: 'obj_2_6', description: 'Extract with intel', isCompleted: false },
        ],
        isActive: false,
        isCompleted: false,
        isPremium: false,
      },
      {
        id: 3,
        title: 'The Nest',
        subtitle: 'Elimination',
        setting: 'Underground bunker complex — enemy command nexus',
        objectives: [
          { id: 'obj_3_1', description: 'Breach the outer perimeter', isCompleted: false },
          { id: 'obj_3_2', description: 'Eliminate Commander Alpha', isCompleted: false },
          { id: 'obj_3_3', description: 'Eliminate Commander Beta', isCompleted: false },
          { id: 'obj_3_4', description: 'Eliminate Commander Gamma', isCompleted: false },
          { id: 'obj_3_5', description: 'Extract before bunker collapse', isCompleted: false },
        ],
        isActive: false,
        isCompleted: false,
        isPremium: false,
      },
      // ──────────────────────────────────────────────
      // PREMIUM MISSIONS
      // ──────────────────────────────────────────────
      {
        id: 4,
        title: 'Silent Thunder',
        subtitle: 'Airbase Sabotage',
        setting: 'Zion Air Force Base',
        objectives: [
          { id: 'obj_4_1', description: 'Infiltrate perimeter fence', isCompleted: false },
          { id: 'obj_4_2', description: 'Plant C4 on jet fighters', isCompleted: false },
          { id: 'obj_4_3', description: 'Survive alarm response', isCompleted: false },
          { id: 'obj_4_4', description: 'Escape via helicopter', isCompleted: false },
        ],
        isActive: false,
        isCompleted: false,
        isPremium: true,
      },
      {
        id: 5,
        title: 'The Command Center',
        subtitle: 'Cyber Warfare',
        setting: 'Celestial Shield Headquarters',
        objectives: [
          { id: 'obj_5_1', description: 'Bypass security systems', isCompleted: false },
          { id: 'obj_5_2', description: 'Access server room', isCompleted: false },
          { id: 'obj_5_3', description: 'Pilot drone to destroy antenna', isCompleted: false },
          { id: 'obj_5_4', description: 'Celestial Shield is DOWN!', isCompleted: false },
        ],
        isActive: false,
        isCompleted: false,
        isPremium: true,
      },
      {
        id: 6,
        title: 'Justice Protocol',
        subtitle: 'The Finale',
        setting: 'The Ivory Tower — Colossus Command',
        objectives: [
          { id: 'obj_6_1', description: 'Lead the assault', isCompleted: false },
          { id: 'obj_6_2', description: 'Defeat Elite Guards', isCompleted: false },
          { id: 'obj_6_3', description: 'Destroy Mech Guardian', isCompleted: false },
          { id: 'obj_6_4', description: 'Confront the Grand Marshal', isCompleted: false },
          { id: 'obj_6_5', description: 'Deliver Justice', isCompleted: false },
        ],
        isActive: false,
        isCompleted: false,
        isPremium: true,
      },
    ];
  }

  // ============================================================
  // PERSISTENCE — localStorage save/load
  // ============================================================

  /**
   * Saves completed mission IDs to localStorage.
   */
  private saveProgress(): void {
    try {
      const completedIds = this.missions
        .filter(m => m.isCompleted)
        .map(m => m.id);
      const data: MissionSaveData = { completedMissions: completedIds };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      console.log(`[MissionManager] Progress saved: ${completedIds}`);
    } catch (e) {
      console.warn('[MissionManager] Could not save progress:', e);
    }
  }

  /**
   * Loads completed mission IDs from localStorage and marks
   * the corresponding missions as completed (without objectives).
   */
  private loadProgress(): void {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;

      const data: MissionSaveData = JSON.parse(raw);
      if (!data.completedMissions || !Array.isArray(data.completedMissions)) return;

      for (const id of data.completedMissions) {
        const mission = this.missions.find(m => m.id === id);
        if (mission) {
          mission.isCompleted = true;
          // Mark all objectives as completed too (for display)
          mission.objectives.forEach(o => (o.isCompleted = true));
        }
      }

      console.log(`[MissionManager] Progress loaded: ${data.completedMissions}`);
    } catch (e) {
      console.warn('[MissionManager] Could not load progress:', e);
    }
  }

  /**
   * Resets ALL saved progress (for debug/testing).
   */
  public resetAllProgress(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
      this.missions.forEach(m => {
        m.isCompleted = false;
        m.isActive = false;
        m.objectives.forEach(o => (o.isCompleted = false));
      });
      console.log('[MissionManager] All progress reset');
    } catch (e) {
      console.warn('[MissionManager] Could not reset progress:', e);
    }
  }

  // ============================================================
  // MISSION START / COMPLETE
  // ============================================================

  public startMission(id: number): Mission | null {
    const mission = this.missions.find((m) => m.id === id);
    if (!mission) return null;

    // Reset all missions' active state and objectives
    this.missions.forEach((m) => {
      m.isActive = false;
      m.objectives.forEach((o) => (o.isCompleted = false));
    });

    mission.isActive = true;
    this.currentMission = mission;
    this._currentPhase = 0;

    return mission;
  }

  public completeObjective(objectiveId: string): void {
    if (!this.currentMission) return;

    const objective = this.currentMission.objectives.find(
      (o) => o.id === objectiveId
    );
    if (objective && !objective.isCompleted) {
      objective.isCompleted = true;
      console.log(`[MissionManager] Objective completed: ${objective.description}`);

      // Advance the current phase index past this objective
      const idx = this.currentMission.objectives.findIndex(o => o.id === objectiveId);
      if (idx >= this._currentPhase) {
        this._currentPhase = idx + 1;
      }

      // Fire per-objective callback
      if (this.onObjectiveComplete) {
        this.onObjectiveComplete(objectiveId);
      }

      // Check if all objectives completed
      const allCompleted = this.currentMission.objectives.every(
        (o) => o.isCompleted
      );
      if (allCompleted) {
        this.completeMission();
      }
    }
  }

  /**
   * Update the description text for an objective (e.g. to show live counts).
   * Only works on the current mission.
   */
  public updateObjectiveDescription(objectiveId: string, newDescription: string): void {
    if (!this.currentMission) return;
    const objective = this.currentMission.objectives.find(o => o.id === objectiveId);
    if (objective) {
      objective.description = newDescription;
    }
  }

  private completeMission(): void {
    if (!this.currentMission) return;

    this.currentMission.isActive = false;
    this.currentMission.isCompleted = true;

    console.log(`[MissionManager] Mission completed: ${this.currentMission.title}`);

    // Save progress to localStorage
    this.saveProgress();

    // Unlock next mission
    const nextMissionId = this.currentMission.id + 1;
    const nextMission = this.missions.find((m) => m.id === nextMissionId);
    if (nextMission) {
      console.log(`[MissionManager] Next mission unlocked: ${nextMission.title}`);
    }

    // Fire the onComplete callback
    if (this.onComplete) {
      this.onComplete(this.currentMission);
    }
  }

  // ============================================================
  // GETTERS
  // ============================================================

  public getCurrentMission(): Mission | null {
    return this.currentMission;
  }

  public getCurrentPhase(): number {
    return this._currentPhase;
  }

  public getMission(id: number): Mission | null {
    return this.missions.find((m) => m.id === id) || null;
  }

  public getAllMissions(): Mission[] {
    return [...this.missions];
  }

  public getFreeMissions(): Mission[] {
    return this.missions.filter((m) => !m.isPremium);
  }

  public getPremiumMissions(): Mission[] {
    return this.missions.filter((m) => m.isPremium);
  }

  public isMissionUnlocked(id: number): boolean {
    if (id === 1) return true;

    const previousMission = this.missions.find((m) => m.id === id - 1);
    return previousMission?.isCompleted ?? false;
  }
}
