namespace com.spike.demandgroupplanner;

// Unlike the raw-pg branch (which points at a manually-created table), this
// approach lets CAP own the schema - `cds deploy` creates its own table
// (and the service-projection view CAP always creates alongside it) rather
// than reusing the raw-pg branch's hand-created demand_group_planner table.
// That's arguably more representative of how this approach is meant to be
// used anyway. Element names stay snake_case only for continuity with the
// other branch's field naming, not because it matters here.
entity DemandGroupPlanner {
  key id            : String(36);
      demand_group  : String(100) @mandatory @title: 'Demand Group';
      planner       : String(100) @mandatory @title: 'Planner';
      delete_flag   : String(1)   default 'N';

      @Core.Computed
      @cds.on.insert: $user
      created_by    : String(100) @title: 'Created By';

      @Core.Computed
      @cds.on.insert: $now
      created_date  : Timestamp   @title: 'Created On';

      @Core.Computed
      @cds.on.insert: $user
      @cds.on.update: $user
      modified_by   : String(100) @title: 'Modified By';

      @Core.Computed
      @cds.on.insert: $now
      @cds.on.update: $now
      modified_date : Timestamp   @title: 'Modified On';
}
