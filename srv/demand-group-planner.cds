service DemandGroupPlannerService @(requires: 'authenticated-user') {

  entity DemandGroupPlanner {
    key id            : String(36);
        demand_group  : String(100) @mandatory @title: 'Demand Group';
        planner       : String(100) @mandatory @title: 'Planner';

        @readonly
        created_by    : String(100) @title: 'Created By';
        @readonly
        created_date  : Timestamp    @title: 'Created On';
        @readonly
        modified_by   : String(100) @title: 'Modified By';
        @readonly
        modified_date : Timestamp    @title: 'Modified On';
  }
}
