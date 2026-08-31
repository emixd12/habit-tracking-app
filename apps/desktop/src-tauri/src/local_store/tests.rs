use super::*;

#[test]
fn current_schema_seeds_one_profile_and_eight_categories() {
    let directory = std::env::temp_dir().join(format!(
        "cadence-local-contract-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("contract.sqlite3");
    let mut connection = db::open(&path).unwrap();
    let profile = execute(&mut connection, Request::ReadProfile {}).unwrap();
    let id = profile["id"].as_str().unwrap().to_owned();
    assert_eq!(profile["timezone"], "America/New_York");
    let categories = execute(
        &mut connection,
        Request::ReadCategories {
            profile_id: id.clone(),
        },
    )
    .unwrap();
    assert_eq!(categories.as_array().unwrap().len(), 8);
    connection
        .execute(
            "DELETE FROM categories WHERE user_id=?1 AND name='Other'",
            [&id],
        )
        .unwrap();
    drop(connection);
    let mut reopened = db::open(&path).unwrap();
    assert_eq!(
        execute(&mut reopened, Request::ReadProfile {}).unwrap(),
        profile
    );
    assert_eq!(
        execute(&mut reopened, Request::ReadCategories { profile_id: id })
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        7
    );
    drop(reopened);
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn local_request_rejects_unknown_operations_and_fields() {
    assert!(serde_json::from_value::<Request>(
        json!({"operation":"readProfile","sql":"DROP TABLE profiles"})
    )
    .is_err());
    assert!(
        serde_json::from_value::<Request>(json!({"operation":"executeSql","sql":"SELECT 1"}))
            .is_err()
    );
}

#[test]
fn utc_comparison_preserves_nanoseconds() {
    assert!(
        db::instant_key("2026-08-30T00:00:00Z").unwrap()
            < db::instant_key("2026-08-30T00:00:00.000000001Z").unwrap()
    );
    assert!(db::instant_key("2026-08-30T00:00:00+01:00").is_err());
    assert!(db::valid_date("2026-02-29").is_err());
}

const NOW: &str = "2026-08-30T12:00:00Z";
fn id(value: u32) -> String {
    format!("00000000-0000-4000-a000-{value:012}")
}
struct Fixture {
    directory: std::path::PathBuf,
    db: Connection,
    profile: String,
}
static FIXTURE_SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
impl Fixture {
    fn new() -> Self {
        Self::at_schema(db::MIGRATIONS.len())
    }
    fn at_schema(version: usize) -> Self {
        let directory = std::env::temp_dir().join(format!(
            "cadence-store-{}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            FIXTURE_SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&directory).unwrap();
        let mut db = Connection::open(directory.join("data.sqlite3")).unwrap();
        db.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;")
            .unwrap();
        db::migrate(&mut db, &db::MIGRATIONS[..version]).unwrap();
        db::seed(&mut db).unwrap();
        let profile = db::profile(&db).unwrap().id;
        Self {
            directory,
            db,
            profile,
        }
    }
    fn run(&mut self, mut request: Value, mutation: u32) -> Result<Value> {
        request["profileId"] = json!(self.profile);
        request["mutationId"] = json!(id(mutation));
        request["now"] = json!(NOW);
        execute(&mut self.db, serde_json::from_value(request).unwrap())
    }
    fn count(&self, table: &str) -> i64 {
        self.db
            .query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .unwrap()
    }
    fn create(&mut self) -> Value {
        let request = create_request(&self.profile);
        self.run(request, 100).unwrap()
    }
    fn occurrence(&mut self) -> Occurrence {
        let row = occurrence_row(&self.profile, 10, "exact", None);
        self.run(json!({"operation":"applyOccurrenceGeneration","behaviorId":id(1),"expectedConfigurationEventId":id(5),"create":[row],"update":[],"delete":[]}),101).unwrap();
        db::by_id(&self.db, &self.profile, &id(10)).unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.directory);
    }
}

fn configuration() -> Value {
    json!({"categoryId":null,"scheduleGraph":[{"recurrenceRule":{"frequency":"daily","interval":1},"sortOrder":0,"timeEntries":[{"kind":"exact","preset":null,"startTime":"09:00:00","endTime":null,"sortOrder":0}]}],"browserReminderEnabled":true,"emailReminderEnabled":false,"reminderOffsetMinutes":0,"active":true,"timezone":"America/New_York"})
}
fn create_request(profile: &str) -> Value {
    json!({"operation":"createBehaviorGraph","graph":{
        "behavior":{"id":id(1),"user_id":profile,"title":"Walk","description":null,"category_id":null,"recurrence_rule":{"frequency":"daily","interval":1},"scheduled_time":"09:00:00","timezone":"America/New_York","browser_reminder_enabled":true,"email_reminder_enabled":false,"reminder_offset_minutes":0,"active":true,"current_configuration_event_id":id(5),"created_at":NOW,"updated_at":NOW,"archived_at":null},
        "schedules":[{"id":id(2),"user_id":profile,"behavior_id":id(1),"recurrence_rule":{"frequency":"daily","interval":1},"sort_order":0,"created_at":NOW,"updated_at":NOW}],
        "slots":[{"id":id(3),"user_id":profile,"behavior_id":id(1),"behavior_schedule_id":id(2),"kind":"exact","preset":null,"start_time":"09:00:00","end_time":null,"sort_order":0,"created_at":NOW,"updated_at":NOW}]},
        "definitionEvent":{"id":id(4),"user_id":profile,"behavior_id":id(1),"previous_title":null,"previous_description":null,"next_title":"Walk","next_description":null,"changed_fields":["title"],"recorded_at":NOW,"source":"manual","reason":null,"created_at":NOW,"updated_at":NOW},
        "configurationEvent":{"id":id(5),"user_id":profile,"behavior_id":id(1),"event_kind":"baseline","previous_configuration":null,"next_configuration":configuration(),"changed_fields":["category_id","schedule_graph","browser_reminder_enabled","email_reminder_enabled","reminder_offset_minutes","active","timezone"],"recorded_at":NOW,"effective_at":NOW,"effective_local_date":"2026-08-30","timezone":"America/New_York","source":"manual","reason_code":"behavior_created","created_at":NOW}})
}
fn occurrence_row(profile: &str, number: u32, kind: &str, end: Option<&str>) -> Occurrence {
    serde_json::from_value(json!({"id":id(number),"user_id":profile,"behavior_id":id(1),"behavior_configuration_event_id":id(5),"behavior_schedule_slot_id":id(3),"scheduled_for":"2026-08-31T13:00:00Z","local_date":"2026-08-31","schedule_kind":kind,"schedule_preset":null,"schedule_start_time":"09:00:00","schedule_end_time":end,"schedule_range_identity":null,"status":"unresolved","completed_at":null,"status_marked_at":null,"note":null,"created_at":NOW,"updated_at":NOW})).unwrap()
}
fn status_request(
    profile: &str,
    previous: &str,
    latest: Option<u32>,
    next: &str,
    event_id: u32,
    instant: &str,
) -> Value {
    let marked = if next == "unresolved" {
        None
    } else {
        Some(instant)
    };
    let completed = if next == "completed" {
        Some(instant)
    } else {
        None
    };
    json!({"operation":"applyStatusTransition","occurrenceId":id(10),"expectedStatus":previous,"expectedLatestEventId":latest.map(id),"status":next,"completedAt":completed,"statusMarkedAt":marked,"cancelPendingReminders":next!="unresolved","event":{"id":id(event_id),"user_id":profile,"occurrence_id":id(10),"behavior_id":id(1),"previous_status":previous,"status":next,"status_semantics":if previous=="unresolved" && latest.is_none(){"explicit_user_mark"}else{"explicit_user_correction"},"recorded_at":instant,"effective_at":marked,"local_date":"2026-08-31","timezone":"America/New_York","source_capture_method":"manual_tap","source_confidence":"high","revises_event_id":latest.map(id),"reason_code":null,"created_at":instant,"updated_at":instant}})
}

#[test]
fn graph_and_outbox_commit_together_and_exact_retries_are_idempotent() {
    let mut fixture = Fixture::new();
    fixture.db.execute_batch("CREATE TRIGGER reject_outbox BEFORE INSERT ON mutation_outbox WHEN new.operation='createBehaviorGraph' BEGIN SELECT RAISE(ABORT,'test rollback'); END;").unwrap();
    assert!(fixture.run(create_request(&fixture.profile), 100).is_err());
    assert_eq!(fixture.count("behaviors"), 0);
    assert_eq!(fixture.count("behavior_definition_events"), 0);
    assert_eq!(fixture.count("mutation_outbox"), 1);
    fixture
        .db
        .execute_batch("DROP TRIGGER reject_outbox")
        .unwrap();
    let first = fixture.create();
    assert_eq!(first["revision"], 1);
    assert_eq!(
        fixture.run(create_request(&fixture.profile), 100).unwrap(),
        first
    );
    assert_eq!(fixture.count("mutation_outbox"), 2);
    let mut changed = create_request(&fixture.profile);
    changed["graph"]["behavior"]["title"] = json!("Run");
    assert!(fixture
        .run(changed, 100)
        .unwrap_err()
        .contains("different plan"));
    let mut reopened = db::open(&fixture.directory.join("data.sqlite3")).unwrap();
    assert_eq!(
        execute(
            &mut reopened,
            Request::ReadBehaviorGraphs {
                profile_id: fixture.profile.clone()
            }
        )
        .unwrap(),
        json!([first])
    );
}

#[test]
fn graph_revision_rejects_aba_and_foreign_rows() {
    let mut fixture = Fixture::new();
    let mut graph = fixture.create();
    graph.as_object_mut().unwrap().remove("revision");
    let base = create_request(&fixture.profile);
    let mut event = base["definitionEvent"].clone();
    event["id"] = json!(id(6));
    event["previous_title"] = json!("Walk");
    event["next_title"] = json!("Run");
    graph["behavior"]["title"] = json!("Run");
    let request = json!({"operation":"updateBehaviorGraph","graph":graph,"expectedRevision":1,"expectedNormalizedDefinition":{"title":"Walk","description":null},"definitionEvent":event,"configurationEvent":null});
    assert_eq!(fixture.run(request.clone(), 102).unwrap()["revision"], 2);
    assert!(fixture
        .run(request, 103)
        .unwrap_err()
        .contains("Behavior changed"));
    let mut foreign = create_request(&fixture.profile);
    foreign["graph"]["slots"][0]["user_id"] = json!(id(999));
    assert!(fixture.run(foreign, 104).is_err());
    assert_eq!(fixture.count("behavior_definition_events"), 2);
}

#[test]
fn occurrence_identity_keeps_exact_and_different_ranges_and_rejects_stale_batch() {
    let mut fixture = Fixture::new();
    fixture.create();
    let exact = occurrence_row(&fixture.profile, 10, "exact", None);
    let range = occurrence_row(&fixture.profile, 11, "range", Some("10:00:00"));
    let longer = occurrence_row(&fixture.profile, 12, "range", Some("11:00:00"));
    fixture.run(json!({"operation":"applyOccurrenceGeneration","behaviorId":id(1),"expectedConfigurationEventId":id(5),"create":[exact,range,longer],"update":[],"delete":[]}),101).unwrap();
    let rows = db::owned::<Occurrence>(&fixture.db, &fixture.profile).unwrap();
    assert_eq!(rows.len(), 3);
    assert_eq!(rows[0].schedule_range_identity, Some(-1));
    assert_eq!(rows[1].schedule_range_identity, Some(36_000_000_000));
    assert_eq!(rows[2].schedule_range_identity, Some(39_600_000_000));
    let mut fresh = occurrence_row(&fixture.profile, 13, "exact", None);
    fresh.local_date = "2026-09-01".into();
    fresh.scheduled_for = "2026-09-01T13:00:00Z".into();
    let duplicate = occurrence_row(&fixture.profile, 14, "exact", None);
    assert!(fixture.run(json!({"operation":"applyOccurrenceGeneration","behaviorId":id(1),"expectedConfigurationEventId":id(5),"create":[fresh,duplicate],"update":[],"delete":[]}),102).is_err());
    assert_eq!(fixture.count("occurrences"), 3);
    assert_eq!(fixture.count("mutation_outbox"), 3);
}

#[test]
fn status_history_snapshot_reminders_and_outbox_are_atomic_with_aba_guard() {
    let mut fixture = Fixture::new();
    fixture.create();
    fixture.occurrence();
    fixture.db.execute("INSERT INTO native_reminder_state (user_id,id,occurrence_id,request_id,fire_at,title,body,status,created_at,updated_at) VALUES (?1,?2,?3,'cadence.test','2026-08-31T13:00:00Z','Test','Synthetic','scheduled',?4,?4)",params![fixture.profile,id(80),id(10),NOW]).unwrap();
    let first = status_request(
        &fixture.profile,
        "unresolved",
        None,
        "completed",
        20,
        "2026-08-30T12:01:00Z",
    );
    let result = fixture.run(first.clone(), 102).unwrap();
    assert_eq!(result["statusChanged"], true);
    let cancelled: String = fixture
        .db
        .query_row("SELECT status FROM native_reminder_state", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(cancelled, "cancelled");
    assert_eq!(
        fixture.run(first, 103).unwrap()["concurrentDuplicate"],
        true
    );
    assert_eq!(fixture.count("occurrence_status_events"), 1);
    fixture
        .run(
            status_request(
                &fixture.profile,
                "completed",
                Some(20),
                "not_completed",
                21,
                "2026-08-30T12:02:00Z",
            ),
            104,
        )
        .unwrap();
    fixture
        .run(
            status_request(
                &fixture.profile,
                "not_completed",
                Some(21),
                "completed",
                22,
                "2026-08-30T12:03:00Z",
            ),
            105,
        )
        .unwrap();
    let count = fixture.count("mutation_outbox");
    assert!(fixture
        .run(
            status_request(
                &fixture.profile,
                "completed",
                Some(20),
                "unresolved",
                23,
                "2026-08-30T12:04:00Z"
            ),
            106
        )
        .unwrap_err()
        .contains("history changed"));
    assert_eq!(fixture.count("occurrence_status_events"), 3);
    assert_eq!(fixture.count("mutation_outbox"), count);
    fixture.db.execute_batch("CREATE TRIGGER reject_status_outbox BEFORE INSERT ON mutation_outbox WHEN new.operation='applyStatusTransition' BEGIN SELECT RAISE(ABORT,'test rollback'); END;").unwrap();
    assert!(fixture
        .run(
            status_request(
                &fixture.profile,
                "completed",
                Some(22),
                "unresolved",
                24,
                "2026-08-30T12:05:00Z"
            ),
            107
        )
        .is_err());
    assert_eq!(fixture.count("occurrence_status_events"), 3);
    assert_eq!(
        db::by_id::<Occurrence>(&fixture.db, &fixture.profile, &id(10))
            .unwrap()
            .status,
        "completed"
    );
}

#[test]
fn generation_preserves_notes_and_configuration_lineage() {
    let mut fixture = Fixture::new();
    fixture.create();
    let before = fixture.occurrence();
    fixture.run(json!({"operation":"updateOccurrenceNote","occurrenceId":id(10),"expectedNote":null,"note":"Keep history"}),102).unwrap();
    assert!(fixture.run(json!({"operation":"updateOccurrenceNote","occurrenceId":id(10),"expectedNote":null,"note":"Stale overwrite"}),103).is_err());
    let noted: Occurrence = db::by_id(&fixture.db, &fixture.profile, &id(10)).unwrap();
    assert_eq!(
        noted.behavior_configuration_event_id,
        before.behavior_configuration_event_id
    );
    assert!(fixture.run(json!({"operation":"applyOccurrenceGeneration","behaviorId":id(1),"expectedConfigurationEventId":id(5),"create":[],"update":[],"delete":[noted]}),104).is_err());
    assert_eq!(fixture.count("occurrences"), 1);
}

#[test]
fn timing_survives_restart_and_reset_requires_exact_sessions_and_writes_tombstones() {
    let mut fixture = Fixture::new();
    fixture.create();
    fixture.occurrence();
    let session:OccurrenceTimeSession=serde_json::from_value(json!({"id":id(30),"user_id":fixture.profile,"behavior_id":id(1),"occurrence_id":id(10),"started_at":NOW,"stopped_at":null,"created_at":NOW,"updated_at":NOW})).unwrap();
    fixture
        .run(
            json!({"operation":"startTimeSession","session":session}),
            102,
        )
        .unwrap();
    let mut duplicate = session.clone();
    duplicate.id = id(31);
    assert!(fixture
        .run(
            json!({"operation":"startTimeSession","session":duplicate}),
            103
        )
        .unwrap()
        .is_null());
    let reopened = db::open(&fixture.directory.join("data.sqlite3")).unwrap();
    assert_eq!(
        db::by_id::<OccurrenceTimeSession>(&reopened, &fixture.profile, &id(30))
            .unwrap()
            .stopped_at,
        None
    );
    fixture.run(json!({"operation":"stopTimeSession","occurrenceId":id(10),"sessionId":id(30),"stoppedAt":"2026-08-30T12:01:00Z"}),104).unwrap();
    assert!(fixture.run(json!({"operation":"resetTimeSessions","occurrenceId":id(10),"expectedSessions":[session]}),105).is_err());
    let stopped: OccurrenceTimeSession = db::by_id(&fixture.db, &fixture.profile, &id(30)).unwrap();
    fixture.run(json!({"operation":"resetTimeSessions","occurrenceId":id(10),"expectedSessions":[stopped]}),106).unwrap();
    assert_eq!(fixture.count("occurrence_time_sessions"), 0);
    assert_eq!(fixture.count("tombstones"), 1);
    assert_eq!(
        db::by_id::<Occurrence>(&fixture.db, &fixture.profile, &id(10))
            .unwrap()
            .status,
        "unresolved"
    );
}

#[test]
fn failed_migration_rolls_back_ddl_and_ledger_without_changing_profile() {
    let mut fixture = Fixture::new();
    let original = db::profile(&fixture.db).unwrap();
    let mut migrations = db::MIGRATIONS.to_vec();
    migrations.push((
        7,
        "broken",
        "CREATE TABLE must_rollback(id INTEGER); INSERT INTO no_such_table VALUES (1);",
    ));
    assert!(db::migrate(&mut fixture.db, &migrations).is_err());
    assert_eq!(fixture.count("schema_migrations"), 6);
    assert_eq!(db::profile(&fixture.db).unwrap(), original);
    let exists: bool = fixture
        .db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='must_rollback')",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!(!exists);
}

#[test]
fn graph_edits_swap_times_and_relocate_retained_slots_without_losing_occurrence_links() {
    let mut fixture = Fixture::new();
    let mut initial = create_request(&fixture.profile);
    let mut second = initial["graph"]["slots"][0].clone();
    second["id"] = json!(id(7));
    second["start_time"] = json!("10:00:00");
    second["sort_order"] = json!(1);
    initial["graph"]["slots"]
        .as_array_mut()
        .unwrap()
        .push(second);
    let second_entry =
        json!({"kind":"exact","preset":null,"startTime":"10:00:00","endTime":null,"sortOrder":1});
    initial["configurationEvent"]["next_configuration"]["scheduleGraph"][0]["timeEntries"]
        .as_array_mut()
        .unwrap()
        .push(second_entry);
    let mut graph = fixture.run(initial.clone(), 100).unwrap();
    graph.as_object_mut().unwrap().remove("revision");
    fixture.occurrence();
    let old_configuration = initial["configurationEvent"]["next_configuration"].clone();
    let mut next_configuration = old_configuration.clone();
    next_configuration["scheduleGraph"][0]["timeEntries"][0]["startTime"] = json!("10:00:00");
    next_configuration["scheduleGraph"][0]["timeEntries"][1]["startTime"] = json!("09:00:00");
    graph["slots"][0]["start_time"] = json!("10:00:00");
    graph["slots"][1]["start_time"] = json!("09:00:00");
    graph["behavior"]["scheduled_time"] = json!("10:00:00");
    graph["behavior"]["current_configuration_event_id"] = json!(id(6));
    let mut event = initial["configurationEvent"].clone();
    event["id"] = json!(id(6));
    event["event_kind"] = json!("revision");
    event["previous_configuration"] = old_configuration;
    event["next_configuration"] = next_configuration;
    event["changed_fields"] = json!(["schedule_graph"]);
    let update = json!({"operation":"updateBehaviorGraph","graph":graph,"expectedRevision":1,"expectedNormalizedDefinition":{"title":"Walk","description":null},"definitionEvent":null,"configurationEvent":event});
    let mut changed = fixture.run(update, 102).unwrap();
    assert_eq!(changed["revision"], 2);
    changed.as_object_mut().unwrap().remove("revision");
    changed["schedules"][0]["id"] = json!(id(8));
    for slot in changed["slots"].as_array_mut().unwrap() {
        slot["behavior_schedule_id"] = json!(id(8));
    }
    fixture.run(json!({"operation":"updateBehaviorGraph","graph":changed,"expectedRevision":2,"expectedNormalizedDefinition":{"title":"Walk","description":null},"definitionEvent":null,"configurationEvent":null}),103).unwrap();
    let occurrence: Occurrence = db::by_id(&fixture.db, &fixture.profile, &id(10)).unwrap();
    assert_eq!(occurrence.behavior_schedule_slot_id, Some(id(3)));
    assert_eq!(occurrence.behavior_configuration_event_id, Some(id(5)));
    assert_eq!(occurrence.schedule_start_time, "09:00:00");
    assert_eq!(fixture.count("behavior_schedule_slots"), 2);
    assert_eq!(fixture.count("behavior_schedules"), 1);
    assert_eq!(fixture.count("tombstones"), 1);
}

#[test]
fn sync_freshness_cas_rejects_a_graph_mutation_during_generation() {
    let mut fixture = Fixture::new();
    let mut state = db::owned::<OccurrenceSyncState>(&fixture.db, &fixture.profile)
        .unwrap()
        .remove(0);
    fixture.create();
    assert!(fixture
        .run(
            json!({"operation":"commitSyncState","expectedVersion":0,"state":state}),
            101
        )
        .is_err());
    state = db::owned::<OccurrenceSyncState>(&fixture.db, &fixture.profile)
        .unwrap()
        .remove(0);
    assert_eq!(state.state_version, 1);
    fixture.occurrence();
    assert_eq!(
        db::owned::<OccurrenceSyncState>(&fixture.db, &fixture.profile).unwrap()[0].state_version,
        1
    );
    state.stale = false;
    state.stale_reason = None;
    state.last_synced_local_date = Some("2026-08-30".into());
    state.synced_through_local_date = Some("2026-09-29".into());
    state.last_successful_sync_at = Some(NOW.into());
    assert_eq!(
        fixture
            .run(
                json!({"operation":"commitSyncState","expectedVersion":1,"state":state}),
                102
            )
            .unwrap()["state_version"],
        2
    );
}

#[test]
fn timezone_commits_profile_graph_history_and_one_invalidation_atomically() {
    let mut fixture = Fixture::new();
    let original_graph = fixture.create();
    let original_occurrence = fixture.occurrence();
    let mut graph = original_graph.clone();
    graph.as_object_mut().unwrap().remove("revision");
    graph["behavior"]["timezone"] = json!("Europe/London");
    graph["behavior"]["current_configuration_event_id"] = json!(id(6));
    let mut configuration = create_request(&fixture.profile)["configurationEvent"].clone();
    configuration["id"] = json!(id(6));
    configuration["event_kind"] = json!("revision");
    configuration["previous_configuration"] = configuration["next_configuration"].clone();
    configuration["next_configuration"]["timezone"] = json!("Europe/London");
    configuration["timezone"] = json!("Europe/London");
    configuration["changed_fields"] = json!(["timezone"]);
    configuration["reason_code"] = json!("timezone_changed");
    let request = json!({"operation":"updateProfileTimezone","expectedTimezone":"America/New_York","expectedSyncVersion":1,"timezone":"Europe/London","updates":[{"graph":graph,"expectedRevision":1,"configurationEvent":configuration}]});
    let mut incomplete = request.clone();
    incomplete["updates"] = json!([]);
    assert!(fixture.run(incomplete, 102).is_err());
    let mut stale = request.clone();
    stale["updates"][0]["expectedRevision"] = json!(0);
    assert!(fixture.run(stale, 102).is_err());
    fixture.db.execute_batch("CREATE TRIGGER fail_timezone_outbox BEFORE INSERT ON mutation_outbox WHEN NEW.operation='updateProfileTimezone' BEGIN SELECT RAISE(ABORT,'forced outbox failure'); END;").unwrap();
    assert!(fixture.run(request.clone(), 102).is_err());
    assert_eq!(
        db::profile(&fixture.db).unwrap().timezone,
        "America/New_York"
    );
    assert_eq!(fixture.count("behavior_configuration_events"), 1);
    assert_eq!(
        behavior::read_graphs(&fixture.db, &fixture.profile).unwrap()[0],
        original_graph
    );
    fixture
        .db
        .execute_batch("DROP TRIGGER fail_timezone_outbox")
        .unwrap();
    assert_eq!(
        fixture.run(request, 102).unwrap()["timezone"],
        "Europe/London"
    );
    assert_eq!(fixture.count("behavior_configuration_events"), 2);
    assert_eq!(
        db::owned::<OccurrenceSyncState>(&fixture.db, &fixture.profile).unwrap()[0].state_version,
        2
    );
    assert_eq!(
        db::by_id::<Occurrence>(&fixture.db, &fixture.profile, &id(10)).unwrap(),
        original_occurrence
    );
    // A previously changed active Behavior remains untouched by a profile-only timezone update.
    fixture
        .db
        .execute(
            "UPDATE profiles SET timezone='America/New_York' WHERE id=?1",
            [&fixture.profile],
        )
        .unwrap();
    let mut unchanged = behavior::read_graphs(&fixture.db, &fixture.profile).unwrap()[0].clone();
    unchanged.as_object_mut().unwrap().remove("revision");
    fixture.run(json!({"operation":"updateProfileTimezone","expectedTimezone":"America/New_York","expectedSyncVersion":2,"timezone":"Europe/London","updates":[{"graph":unchanged,"expectedRevision":2,"configurationEvent":null}]}),103).unwrap();
    assert_eq!(fixture.count("behavior_configuration_events"), 2);
    assert_eq!(
        behavior::read_graphs(&fixture.db, &fixture.profile).unwrap()[0]["revision"],
        2
    );
}

fn native_reminder(profile: &str) -> Value {
    json!({"user_id":profile,"id":id(40),"occurrence_id":id(10),"request_id":format!("cadence.local.{}",id(10)),"fire_at":"2026-08-31T13:00:00Z","title":"Walk","body":"Test reminder","status":"planned","error":null,"verified_at":null,"created_at":NOW,"updated_at":NOW})
}

fn limited_coverage() -> Value {
    json!({"status":"limited","target_through":"2026-09-29T12:00:00Z","scheduled_through":"2026-08-31T13:00:00Z","first_unscheduled_at":"2026-09-01T13:00:00Z","expected_count":2,"scheduled_count":1,"missing_ids":[format!("cadence.local.{}",id(11))],"reason":"os_capacity","verified_at":NOW})
}

#[test]
fn reminder_intent_receipts_and_dataset_cas_preserve_failed_cancellation() {
    let mut fixture = Fixture::new();
    fixture.create();
    fixture.occurrence();
    let revision = reminder::revision(&fixture.db, &fixture.profile).unwrap();
    let plan = json!({"operation":"commitNativeReminderPlan","expectedRevision":revision,"reminders":[native_reminder(&fixture.profile)],"cancelIds":[]});
    let planned = fixture.run(plan.clone(), 102).unwrap();
    assert_eq!(planned["revision"], revision + 1);
    assert_eq!(planned["reminders"][0]["status"], "planned");
    assert!(planned["coverage"].is_null());
    assert_eq!(fixture.run(plan, 102).unwrap(), planned);
    let receipt = json!({"operation":"recordNativeReminderCoverage","expectedRevision":planned["revision"],"coverage":limited_coverage(),"observed":[{"id":id(40),"status":"scheduled","error":null}]});
    let verified = fixture.run(receipt.clone(), 103).unwrap();
    assert_eq!(verified["coverage"]["status"], "limited");
    assert_eq!(
        verified["coverage"]["dataset_revision"],
        verified["revision"]
    );
    assert_eq!(verified["reminders"][0]["status"], "scheduled");
    fixture
        .run(
            status_request(&fixture.profile, "unresolved", None, "completed", 20, NOW),
            104,
        )
        .unwrap();
    let current = reminder::read(&fixture.db, &fixture.profile).unwrap();
    assert_eq!(current["coverage"]["status"], "unverified");
    assert!(current["coverage"]["verified_at"].is_null());
    assert_eq!(current["reminders"][0]["status"], "cancelled");
    assert!(fixture.run(receipt, 105).is_err());
    let mut unverified = limited_coverage();
    unverified["status"] = json!("unverified");
    unverified["verified_at"] = Value::Null;
    unverified["reason"] = json!("OS cancellation failed");
    let failure = json!({"operation":"recordNativeReminderCoverage","expectedRevision":current["revision"],"coverage":unverified,"observed":[{"id":id(40),"status":"failed","error":"OS timeout"}]});
    let failed = fixture.run(failure, 106).unwrap();
    assert_eq!(failed["reminders"][0]["status"], "cancelled");
    assert_eq!(failed["reminders"][0]["error"], "OS timeout");
    assert!(failed["reminders"][0]["verified_at"].is_null());
    let reopened = db::open(&fixture.directory.join("data.sqlite3")).unwrap();
    assert_eq!(reminder::read(&reopened, &fixture.profile).unwrap(), failed);
    // Cancellation is idempotent, including a valid unknown UUID.
    fixture.run(json!({"operation":"commitNativeReminderPlan","expectedRevision":failed["revision"],"reminders":[],"cancelIds":[id(40),id(999)]}),107).unwrap();
    assert_eq!(fixture.count("native_reminder_state"), 1);
}

#[test]
fn reminder_receipt_and_outbox_failure_roll_back_together() {
    let mut fixture = Fixture::new();
    fixture.create();
    fixture.occurrence();
    let revision = reminder::revision(&fixture.db, &fixture.profile).unwrap();
    let planned=fixture.run(json!({"operation":"commitNativeReminderPlan","expectedRevision":revision,"reminders":[native_reminder(&fixture.profile)],"cancelIds":[]}),102).unwrap();
    fixture.db.execute_batch("CREATE TRIGGER fail_receipt_outbox BEFORE INSERT ON mutation_outbox WHEN NEW.operation='recordNativeReminderCoverage' BEGIN SELECT RAISE(ABORT,'forced outbox failure'); END;").unwrap();
    assert!(fixture.run(json!({"operation":"recordNativeReminderCoverage","expectedRevision":planned["revision"],"coverage":limited_coverage(),"observed":[{"id":id(40),"status":"scheduled","error":null}]}),103).is_err());
    assert_eq!(
        reminder::read(&fixture.db, &fixture.profile).unwrap(),
        planned
    );
    // Native writes cannot manufacture successful scheduling while accepting a desired plan.
    let mut invalid = native_reminder(&fixture.profile);
    invalid["status"] = json!("scheduled");
    assert!(fixture.run(json!({"operation":"commitNativeReminderPlan","expectedRevision":planned["revision"],"reminders":[invalid],"cancelIds":[]}),104).is_err());
    assert!(fixture.run(json!({"operation":"commitNativeReminderPlan","expectedRevision":planned["revision"],"reminders":[],"cancelIds":[]}),104).is_err());
}

#[test]
fn exact_os_delivery_corrects_expiry_history_but_rejects_stale_requests() {
    let mut fixture = Fixture::new();
    fixture.create();
    fixture.occurrence();
    let revision = reminder::revision(&fixture.db, &fixture.profile).unwrap();
    let planned = fixture.run(json!({"operation":"commitNativeReminderPlan","expectedRevision":revision,"reminders":[native_reminder(&fixture.profile)],"cancelIds":[]}),102).unwrap();
    let cancelled = fixture.run(json!({"operation":"commitNativeReminderPlan","expectedRevision":planned["revision"],"reminders":[],"cancelIds":[id(40)]}),103).unwrap();
    let proof = json!({"requestId":format!("cadence.local.{}",id(10)),"fireAt":"2026-08-31T13:00:00Z","title":"Walk","body":"Test reminder","deliveredAt":"2026-08-31T13:00:01Z"});
    let mut coverage = limited_coverage();
    coverage["status"] = json!("unverified");
    coverage["verified_at"] = Value::Null;
    let request = json!({"operation":"recordNativeReminderCoverage","profileId":fixture.profile,"mutationId":id(104),"now":"2026-08-31T13:02:00Z","expectedRevision":cancelled["revision"],"coverage":coverage,
        "observed":[{"id":id(40),"status":"delivered","error":null,"delivery":proof}]});
    for (field, value) in [
        ("requestId", format!("cadence.local.{}", id(11))),
        ("title", "Old title".into()),
        ("body", "Old body".into()),
        ("fireAt", "2026-08-31T12:59:00Z".into()),
        ("deliveredAt", "2026-08-31T12:59:59Z".into()),
        ("deliveredAt", "2026-08-31T13:02:01Z".into()),
    ] {
        let mut invalid = request.clone();
        invalid["observed"][0]["delivery"][field] = json!(value);
        assert!(execute(&mut fixture.db, serde_json::from_value(invalid).unwrap()).is_err());
        assert_eq!(
            reminder::read(&fixture.db, &fixture.profile).unwrap(),
            cancelled
        );
    }
    let mut missing = request.clone();
    missing["observed"][0]["delivery"] = Value::Null;
    assert!(execute(&mut fixture.db, serde_json::from_value(missing).unwrap()).is_err());
    let mut extraneous = request.clone();
    extraneous["observed"][0]["status"] = json!("cancelled");
    assert!(execute(&mut fixture.db, serde_json::from_value(extraneous).unwrap()).is_err());
    let observed = execute(&mut fixture.db, serde_json::from_value(request).unwrap()).unwrap();
    assert_eq!(observed["reminders"][0]["status"], "delivered");
    assert_eq!(
        observed["reminders"][0]["verified_at"],
        "2026-08-31T13:02:00Z"
    );
    let reopened = db::open(&fixture.directory.join("data.sqlite3")).unwrap();
    assert_eq!(
        reminder::read(&reopened, &fixture.profile).unwrap(),
        observed
    );
}

#[test]
fn export_reads_complete_histories_and_filters_sessions_at_nanosecond_boundary() {
    let mut fixture = Fixture::new();
    fixture.create();
    fixture.occurrence();
    for (number, start) in [(30, NOW), (31, "2026-08-30T12:00:00.000000001Z")] {
        let session:OccurrenceTimeSession=serde_json::from_value(json!({"id":id(number),"user_id":fixture.profile,"behavior_id":id(1),"occurrence_id":id(10),"started_at":start,"stopped_at":"2026-08-30T12:01:00Z","created_at":NOW,"updated_at":NOW})).unwrap();
        db::insert(&fixture.db, &fixture.profile, &session).unwrap();
    }
    let request = json!({"operation":"readExportSnapshot","profileId":fixture.profile,"startLocalDate":"2026-08-31","endLocalDate":"2026-08-31","includeTimeTracking":true,"throughStartedAt":NOW});
    let result = execute(
        &mut fixture.db,
        serde_json::from_value(request.clone()).unwrap(),
    )
    .unwrap();
    assert_eq!(result["occurrences"].as_array().unwrap().len(), 1);
    assert_eq!(result["timeSessions"].as_array().unwrap().len(), 1);
    assert_eq!(result["timeSessions"][0]["id"], id(30));
    let mut request = request;
    request["endLocalDate"] = json!("2026-08-30");
    request["startLocalDate"] = Value::Null;
    let before = execute(
        &mut fixture.db,
        serde_json::from_value(request.clone()).unwrap(),
    )
    .unwrap();
    assert!(before["occurrences"].as_array().unwrap().is_empty());
    assert_eq!(
        before["behaviorDefinitionEvents"].as_array().unwrap().len(),
        1
    );
    assert_eq!(
        before["behaviorConfigurationEvents"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    request["endLocalDate"] = json!("2026-08-31");
    request["includeTimeTracking"] = json!(false);
    let no_time = execute(&mut fixture.db, serde_json::from_value(request).unwrap()).unwrap();
    assert!(no_time["timeSessions"].as_array().unwrap().is_empty());
}

fn import_run(profile: &str, number: u32, mode: &str) -> Value {
    json!({"id":id(number),"user_id":profile,"accepted_preview_fingerprint":null,"accepted_preview_run_id":null,"bundle_fingerprint":"b".repeat(64),"bundle_format":"behaviorlog-bundle","completed_at":null,"created_at":NOW,"dry_run_summary":{"valid":true,"previewFingerprint":"a".repeat(64),"localDataFingerprint":"c".repeat(64),"bundleFingerprint":"b".repeat(64),"mergePreview":{"conflictCount":0}},"failure_message":null,"import_mode":mode,"manifest_sha256":null,"privacy_redaction_level":null,"producer_name":null,"producer_version":null,"schema_version":"1.0","started_at":NOW,"status":"previewed","subject_id_strategy":null,"updated_at":NOW})
}

#[test]
fn import_history_filters_before_limit_and_keeps_nanosecond_order() {
    let mut fixture = Fixture::new();
    for (number, mode, started) in [
        (60, "restore_preview", "2026-08-30T12:00:00Z"),
        (61, "restore_preview", "2026-08-30T12:00:00.000000001Z"),
        (62, "merge_preview", "2026-08-30T12:00:01Z"),
    ] {
        let mut row = import_run(&fixture.profile, number, mode);
        row["started_at"] = json!(started);
        db::insert(
            &fixture.db,
            &fixture.profile,
            &serde_json::from_value::<BehaviorLogImportRun>(row).unwrap(),
        )
        .unwrap();
    }
    let read = |kind: Option<&str>| {
        let mut request =
            json!({"operation":"readImportRuns","profileId":fixture.profile,"limit":1});
        if let Some(kind) = kind {
            request["kind"] = json!(kind);
        }
        serde_json::from_value(request).unwrap()
    };
    let restore = read(Some("restore"));
    let import = read(Some("import"));
    let all = read(None);
    assert_eq!(execute(&mut fixture.db, restore).unwrap()[0]["id"], id(61));
    assert_eq!(execute(&mut fixture.db, import).unwrap()[0]["id"], id(62));
    assert_eq!(execute(&mut fixture.db, all).unwrap()[0]["id"], id(62));
    assert!(serde_json::from_value::<Request>(json!({"operation":"readImportRuns","profileId":fixture.profile,"limit":1,"kind":"arbitrary"})).is_err());
}

#[test]
fn preview_rejects_ambiguous_archive_binding_and_malformed_validation_summary() {
    let mut fixture = Fixture::new();
    let profile = fixture.profile.clone();
    let revision = import::domain_revision(&fixture.db, &profile).unwrap();
    for changes in [
        json!({"archiveFingerprint":"d".repeat(64),"bundlePayloadFingerprint":"e".repeat(64)}),
        json!({"archiveFingerprint":false}),
        json!({"errorCount":"0"}),
        json!({"errors":{}}),
    ] {
        let mut preview = import_run(&profile, 60, "merge_preview");
        preview["dry_run_summary"]
            .as_object_mut()
            .unwrap()
            .extend(changes.as_object().unwrap().clone());
        assert!(fixture.run(json!({"operation":"prepareBehaviorLogImport","expectedRevision":revision,"previewRun":preview,"plan":import_plan(&profile)}),100).is_err());
        assert_eq!(fixture.count("behaviorlog_import_runs"), 0);
        assert_eq!(fixture.count("mutation_outbox"), 1);
    }
}

#[test]
fn accepted_archive_cannot_replace_definition_or_schedule() {
    let mut fixture = Fixture::new();
    fixture.create();
    let profile = fixture.profile.clone();
    let mut preview = import_run(&profile, 60, "restore_preview");
    preview["dry_run_summary"]["archiveFingerprint"] = json!("d".repeat(64));
    preview["dry_run_summary"]["statusHistoryPolicy"] =
        json!({"selected":"preserve_append_only_history","applySupportedInThisTicket":true});
    preview["dry_run_summary"]["summary"] = json!({"unsupportedActionCount":0,"skippedCount":0});
    preview["dry_run_summary"]["actions"] =
        json!({"behaviors":[{"localId":id(1),"externalId":null,"action":"archive"}]});
    let mut plan = import_plan(&profile);
    plan["mode"] = json!("restore_apply");
    plan["applyRun"]["import_mode"] = json!("restore_apply");
    plan["definitionEvents"] = json!([]);
    plan["occurrenceWrites"] = json!([]);
    plan["mappings"] = json!([]);
    let graph = &mut plan["graphWrites"][0];
    graph["expectedRevision"] = json!(1);
    graph["graph"]["behavior"]["active"] = json!(false);
    graph["graph"]["behavior"]["archived_at"] = json!(NOW);
    graph["graph"]["behavior"]["current_configuration_event_id"] = json!(id(6));
    let event = &mut graph["configurationEvents"][0];
    event["id"] = json!(id(6));
    event["event_kind"] = json!("revision");
    event["previous_configuration"] = configuration();
    event["next_configuration"]["active"] = json!(false);
    event["changed_fields"] = json!(["active"]);
    event["reason_code"] = json!("behaviorlog_restore");
    let revision = import::domain_revision(&fixture.db, &profile).unwrap();
    for field in ["title", "schedule"] {
        let mut invalid = plan.clone();
        if field == "title" {
            invalid["graphWrites"][0]["graph"]["behavior"]["title"] = json!("Unreviewed title");
        } else {
            invalid["graphWrites"][0]["graph"]["slots"][0]["start_time"] = json!("10:00:00");
        }
        let error = fixture.run(json!({"operation":"prepareBehaviorLogImport","expectedRevision":revision,"previewRun":preview,"plan":invalid}),101).unwrap_err();
        assert!(error.contains("archive action"), "{error}");
        assert_eq!(fixture.count("behaviorlog_import_runs"), 0);
    }
    fixture.run(json!({"operation":"prepareBehaviorLogImport","expectedRevision":revision,"previewRun":preview,"plan":plan}),101).unwrap();
    let mut apply = apply_import_request();
    apply["importMode"] = json!("restore_apply");
    apply["bundlePayloadFingerprint"] = json!("d".repeat(64));
    let result = fixture.run(apply, 102).unwrap();
    assert_eq!(result["status"], "applied", "{result}");
    let archived = behavior::graph(&fixture.db, &profile, &id(1)).unwrap();
    assert!(!archived.behavior.active);
    assert_eq!(archived.behavior.title, "Walk");
    assert_eq!(archived.slots[0].start_time, "09:00:00");
}
fn import_plan(profile: &str) -> Value {
    let mut run = import_run(profile, 61, "create_missing_only");
    run["accepted_preview_fingerprint"] = json!("a".repeat(64));
    run["accepted_preview_run_id"] = json!(id(60));
    let create = create_request(profile);
    let mut definition = create["definitionEvent"].clone();
    definition["source"] = json!("import");
    let mut configuration = create["configurationEvent"].clone();
    configuration["source"] = json!("import");
    json!({"mode":"create_missing_only","applyRun":run,"categoryCreates":[],"graphWrites":[{"expectedRevision":null,"graph":create["graph"],"configurationEvents":[configuration]}],"definitionEvents":[definition],"statusEvents":[],"occurrenceWrites":[{"expected":null,"next":occurrence_row(profile,10,"exact",None)}],"occurrenceDeletes":[],"timeSessionWrites":[],"importedNoteWrites":[],"importedNoteDeletes":[],"importedInterventionWrites":[],"importedInterventionDeletes":[],"mappings":[{"id":id(62),"user_id":profile,"import_run_id":id(61),"record_type":"behavior","external_id":"behavior.walk","local_id":id(1),"created_at":NOW}],"result":{"created":{"behaviors":1,"occurrences":1}}})
}
fn prepare_import(fixture: &mut Fixture, plan: Value) -> Value {
    let revision = import::domain_revision(&fixture.db, &fixture.profile).unwrap();
    fixture.run(json!({"operation":"prepareBehaviorLogImport","expectedRevision":revision,"previewRun":import_run(&fixture.profile,60,"merge_preview"),"plan":plan}),100).unwrap()
}
fn apply_import_request() -> Value {
    json!({"operation":"applyBehaviorLogImport","importMode":"create_missing_only","previewRunId":id(60),"previewFingerprint":"a".repeat(64),"localDataFingerprint":"c".repeat(64),"bundleFingerprint":"b".repeat(64),"bundlePayloadFingerprint":null})
}

fn imported_intervention(
    profile: &str,
    number: u32,
    channel: &str,
    status: &str,
) -> ImportedIntervention {
    serde_json::from_value(json!({
        "id":id(number),"user_id":profile,"import_run_id":id(61),
        "external_id":format!("intervention.{number}"),"intervention_type":"reminder",
        "behavior_external_id":"behavior.walk","behavior_id":id(1),
        "occurrence_external_id":"occurrence.walk","occurrence_id":id(10),
        "channel":channel,"delivery_status":status,"scheduled_send_at":NOW,
        "sent_at":null,"failure_reason":null,"metadata":{"preserved":true},
        "redacted_sensitivity_indicators":[],"source_capture_method":"import",
        "source_confidence":"high","source_original_id":format!("original.{number}"),
        "created_at":NOW,"updated_at":NOW
    }))
    .unwrap()
}

#[test]
fn passive_intervention_import_accepts_standard_channels_without_scheduling_reminders() {
    let mut fixture = Fixture::new();
    let channels = [
        "browser_push",
        "email",
        "sms",
        "mobile_push",
        "in_app",
        "calendar_notification",
        "voice_assistant",
        "webhook",
        "other",
        "none",
    ];
    let statuses = [
        "pending",
        "sent",
        "delivered",
        "failed",
        "cancelled",
        "suppressed",
        "unknown",
    ];
    let mut plan = import_plan(&fixture.profile);
    let mut writes = Vec::new();
    for (index, (channel, status)) in channels
        .iter()
        .flat_map(|channel| statuses.iter().map(move |status| (channel, status)))
        .enumerate()
    {
        writes.push(json!({"expected":null,"next":imported_intervention(&fixture.profile, 200 + index as u32, channel, status)}));
    }
    plan["importedInterventionWrites"] = json!(writes);
    prepare_import(&mut fixture, plan);
    let result = fixture.run(apply_import_request(), 101).unwrap();
    assert_eq!(result["status"], "applied", "{result}");
    assert_eq!(fixture.count("imported_interventions"), 70);
    assert_eq!(fixture.count("reminder_deliveries"), 0);
    assert_eq!(fixture.count("native_reminder_state"), 0);
    let reopened = db::open(&fixture.directory.join("data.sqlite3")).unwrap();
    assert_eq!(
        db::owned::<ImportedIntervention>(&reopened, &fixture.profile)
            .unwrap()
            .len(),
        70
    );
}

#[test]
fn passive_intervention_migration_preserves_history_provenance_and_revision_after_rollback() {
    let mut fixture = Fixture::at_schema(5);
    let mut plan = import_plan(&fixture.profile);
    let intervention = imported_intervention(&fixture.profile, 200, "browser_push", "sent");
    plan["importedInterventionWrites"] = json!([{"expected":null,"next":intervention}]);
    prepare_import(&mut fixture, plan);
    assert_eq!(
        fixture.run(apply_import_request(), 101).unwrap()["status"],
        "applied"
    );
    let reminder: ReminderDelivery = serde_json::from_value(json!({
        "id":id(201),"user_id":fixture.profile,"occurrence_id":id(10),
        "channel":"browser_push","status":"pending","scheduled_send_at":NOW,
        "sent_at":null,"error":null,"processing_started_at":null,
        "import_run_id":id(61),"imported_intervention_id":id(200),
        "created_at":NOW,"updated_at":NOW
    }))
    .unwrap();
    db::insert(&fixture.db, &fixture.profile, &reminder).unwrap();
    let before = import::snapshot(&fixture.db, &fixture.profile).unwrap();
    let outbox = |db: &Connection| -> String {
        db.query_row("SELECT json_group_array(json_array(sequence,mutation_id,user_id,operation,request_json,result_json,created_at,synced_at)) FROM (SELECT * FROM mutation_outbox ORDER BY sequence)", [], |row| row.get(0)).unwrap()
    };
    let previous_outbox = outbox(&fixture.db);
    // Fail after rebuilding the table and restoring links. The enclosing
    // migration must roll all DDL, provenance changes, and ledger writes back.
    let broken = format!(
        "{}\nINSERT INTO missing_migration_test_table VALUES(1);",
        db::MIGRATIONS[5].2
    );
    let mut failed_migrations = db::MIGRATIONS[..5].to_vec();
    failed_migrations.push((6, "passive_intervention_channels", &broken));
    assert!(db::migrate(&mut fixture.db, &failed_migrations).is_err());
    assert_eq!(fixture.count("schema_migrations"), 5);
    assert_eq!(
        import::snapshot(&fixture.db, &fixture.profile).unwrap(),
        before
    );
    assert_eq!(outbox(&fixture.db), previous_outbox);
    assert!(db::insert(
        &fixture.db,
        &fixture.profile,
        &imported_intervention(&fixture.profile, 202, "other", "delivered")
    )
    .is_err());

    db::migrate(&mut fixture.db, db::MIGRATIONS).unwrap();
    assert_eq!(fixture.count("schema_migrations"), 6);
    assert_eq!(
        import::snapshot(&fixture.db, &fixture.profile).unwrap(),
        before
    );
    assert_eq!(outbox(&fixture.db), previous_outbox);
    assert_eq!(
        fixture
            .db
            .query_row("PRAGMA foreign_keys", [], |row| row.get::<_, i64>(0))
            .unwrap(),
        1
    );
    assert_eq!(
        fixture
            .db
            .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap(),
        0
    );
    let reopened = db::open(&fixture.directory.join("data.sqlite3")).unwrap();
    assert_eq!(
        import::snapshot(&reopened, &fixture.profile).unwrap(),
        before
    );
    db::insert(
        &reopened,
        &fixture.profile,
        &imported_intervention(&fixture.profile, 202, "other", "delivered"),
    )
    .unwrap();
    assert_eq!(
        import::domain_revision(&reopened, &fixture.profile).unwrap(),
        before["revision"].as_i64().unwrap() + 1
    );
    // These values remain passive. They must never widen operational delivery.
    let mut invalid_reminder = reminder.clone();
    invalid_reminder.id = id(203);
    invalid_reminder.channel = "other".into();
    assert!(db::insert(&reopened, &fixture.profile, &invalid_reminder).is_err());
    invalid_reminder.channel = "email".into();
    invalid_reminder.status = "delivered".into();
    assert!(db::insert(&reopened, &fixture.profile, &invalid_reminder).is_err());
    assert_eq!(
        db::owned::<ReminderDelivery>(&reopened, &fixture.profile).unwrap(),
        vec![reminder]
    );
}

#[test]
fn invalid_passive_intervention_enums_roll_back_the_entire_import() {
    for (channel, status) in [
        ("arbitrary", "sent"),
        ("other", "arbitrary"),
        ("other", "planned"),
    ] {
        let mut fixture = Fixture::new();
        let mut plan = import_plan(&fixture.profile);
        plan["importedInterventionWrites"] = json!([{"expected":null,"next":imported_intervention(&fixture.profile, 200, channel, status)}]);
        prepare_import(&mut fixture, plan);
        assert_eq!(
            fixture.run(apply_import_request(), 101).unwrap()["status"],
            "failed"
        );
        assert_eq!(fixture.count("behaviors"), 0);
        assert_eq!(fixture.count("occurrences"), 0);
        assert_eq!(fixture.count("imported_interventions"), 0);
        assert_eq!(fixture.count("reminder_deliveries"), 0);
        assert_eq!(fixture.count("native_reminder_state"), 0);
    }
}

#[test]
fn reviewed_import_plan_writes_nothing_until_apply_and_replays_one_result() {
    let mut fixture = Fixture::new();
    let profile = fixture.profile.clone();
    let prepared = prepare_import(&mut fixture, import_plan(&profile));
    assert_eq!(fixture.count("behaviors"), 0);
    assert_eq!(fixture.count("occurrences"), 0);
    assert_eq!(fixture.count("behaviorlog_import_runs"), 1);
    let mut wrong_mode = apply_import_request();
    wrong_mode["importMode"] = json!("restore_apply");
    assert!(fixture.run(wrong_mode, 101).is_err());
    assert_eq!(fixture.count("behaviorlog_import_runs"), 1);
    assert_eq!(fixture.count("behaviors"), 0);
    assert_eq!(
        prepared["revision"],
        import::domain_revision(&fixture.db, &profile).unwrap()
    );
    let mut substituted = apply_import_request();
    substituted["plan"] = import_plan(&profile);
    substituted["profileId"] = json!(profile);
    substituted["mutationId"] = json!(id(101));
    substituted["now"] = json!(NOW);
    assert!(serde_json::from_value::<Request>(substituted).is_err());
    let applied = fixture.run(apply_import_request(), 101).unwrap();
    assert_eq!(applied["status"], "applied");
    assert_eq!(fixture.count("behaviors"), 1);
    assert_eq!(fixture.count("occurrences"), 1);
    assert_eq!(fixture.count("behavior_definition_events"), 1);
    assert_eq!(fixture.count("behavior_configuration_events"), 1);
    assert_eq!(fixture.count("behaviorlog_import_runs"), 2);
    assert_eq!(fixture.count("behaviorlog_import_record_mappings"), 1);
    let repeated = fixture.run(apply_import_request(), 102).unwrap();
    assert_eq!(repeated["alreadyApplied"], true);
    assert_eq!(fixture.count("behaviorlog_import_record_mappings"), 1);
    let mut wrong = apply_import_request();
    wrong["bundleFingerprint"] = json!("f".repeat(64));
    assert!(fixture.run(wrong, 103).is_err());
    let reopened = db::open(&fixture.directory.join("data.sqlite3")).unwrap();
    assert_eq!(
        import::snapshot(&reopened, &profile).unwrap()["occurrences"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn identity_adoption_preserves_committed_wal_history_provenance_and_outbox() {
    let mut fixture = Fixture::new();
    let support = fixture.directory.join("Application Support");
    let previous = support.join("app.cadence.desktop-spike");
    let current = support.join("app.cadence.desktop");
    std::fs::create_dir_all(&previous).unwrap();
    std::fs::create_dir_all(&current).unwrap();
    let source_path = previous.join("cadence.sqlite3");
    fixture.db = db::open(&source_path).unwrap();
    fixture
        .db
        .execute_batch("PRAGMA wal_autocheckpoint=0;")
        .unwrap();
    fixture.profile = db::profile(&fixture.db).unwrap().id;
    let profile = fixture.profile.clone();
    prepare_import(&mut fixture, import_plan(&profile));
    assert_eq!(
        fixture.run(apply_import_request(), 101).unwrap()["status"],
        "applied"
    );
    fixture
        .run(
            status_request(&profile, "unresolved", None, "completed", 20, NOW),
            102,
        )
        .unwrap();
    fixture.run(json!({"operation":"updateOccurrenceNote","occurrenceId":id(10),"expectedNote":null,"note":"Retain this imported history"}),103).unwrap();
    let session = json!({"id":id(30),"user_id":profile,"behavior_id":id(1),"occurrence_id":id(10),"started_at":NOW,"stopped_at":null,"created_at":NOW,"updated_at":NOW});
    fixture
        .run(
            json!({"operation":"startTimeSession","session":session}),
            104,
        )
        .unwrap();
    let stored: OccurrenceTimeSession = db::by_id(&fixture.db, &profile, &id(30)).unwrap();
    fixture.run(json!({"operation":"resetTimeSessions","occurrenceId":id(10),"expectedSessions":[stored]}),105).unwrap();
    let mut retained_session = session;
    retained_session["id"] = json!(id(31));
    fixture
        .run(
            json!({"operation":"startTimeSession","session":retained_session}),
            106,
        )
        .unwrap();
    let snapshot = import::snapshot(&fixture.db, &profile).unwrap();
    let ledger = |db: &Connection| -> Vec<String> {
        db.prepare("SELECT json_array(sequence,mutation_id,user_id,operation,request_json,result_json,created_at) FROM mutation_outbox ORDER BY sequence").unwrap().query_map([],|row|row.get(0)).unwrap().collect::<rusqlite::Result<_>>().unwrap()
    };
    let outbox = ledger(&fixture.db);
    let tombstones: Vec<String> = fixture.db.prepare("SELECT json_array(user_id,entity_type,entity_id,mutation_id,deleted_at) FROM tombstones ORDER BY entity_id").unwrap().query_map([],|row|row.get(0)).unwrap().collect::<rusqlite::Result<_>>().unwrap();
    assert!(
        std::fs::metadata(previous.join("cadence.sqlite3-wal"))
            .unwrap()
            .len()
            > 0
    );
    adopt_previous_identity(&current).unwrap();
    let adopted = db::open(&current.join("cadence.sqlite3")).unwrap();
    assert_eq!(import::snapshot(&adopted, &profile).unwrap(), snapshot);
    assert_eq!(ledger(&adopted), outbox);
    let copied_tombstones: Vec<String> = adopted.prepare("SELECT json_array(user_id,entity_type,entity_id,mutation_id,deleted_at) FROM tombstones ORDER BY entity_id").unwrap().query_map([],|row|row.get(0)).unwrap().collect::<rusqlite::Result<_>>().unwrap();
    assert_eq!(copied_tombstones, tombstones);
    assert_eq!(import::snapshot(&fixture.db, &profile).unwrap(), snapshot);
    assert!(source_path.exists());
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            std::fs::metadata(current.join("cadence.sqlite3"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
    adopted
        .execute(
            "UPDATE profiles SET display_name='Final identity writes'",
            [],
        )
        .unwrap();
    adopt_previous_identity(&current).unwrap();
    assert_eq!(
        db::profile(&adopted).unwrap().display_name.as_deref(),
        Some("Final identity writes")
    );
    assert_eq!(db::profile(&fixture.db).unwrap().display_name, None);
}

#[test]
fn import_late_failure_rolls_back_products_but_keeps_failed_ledger_and_outbox() {
    let mut fixture = Fixture::new();
    let profile = fixture.profile.clone();
    let mut plan = import_plan(&profile);
    plan["mappings"][0]["local_id"] = json!(id(999));
    prepare_import(&mut fixture, plan);
    let failed = fixture.run(apply_import_request(), 101).unwrap();
    assert_eq!(failed["status"], "failed");
    assert!(failed["error"].as_str().unwrap().contains("provenance"));
    assert_eq!(fixture.count("behaviors"), 0);
    assert_eq!(fixture.count("occurrences"), 0);
    assert_eq!(fixture.count("behavior_definition_events"), 0);
    assert_eq!(fixture.count("behavior_configuration_events"), 0);
    assert_eq!(fixture.count("behaviorlog_import_record_mappings"), 0);
    assert_eq!(fixture.count("behaviorlog_import_runs"), 2);
    assert_eq!(fixture.count("mutation_outbox"), 3);
    assert_eq!(
        db::by_id::<BehaviorLogImportRun>(&fixture.db, &profile, &id(61))
            .unwrap()
            .status,
        "failed"
    );
}

#[test]
fn stale_import_preview_refuses_data_changes_and_retains_failed_attempt() {
    let mut fixture = Fixture::new();
    let profile = fixture.profile.clone();
    prepare_import(&mut fixture, import_plan(&profile));
    fixture.run(json!({"operation":"updateProfileTimezone","expectedTimezone":"America/New_York","expectedSyncVersion":0,"timezone":"Europe/London","updates":[]}),102).unwrap();
    let failed = fixture.run(apply_import_request(), 103).unwrap();
    assert_eq!(failed["status"], "failed");
    assert!(failed["error"].as_str().unwrap().contains("changed"));
    assert_eq!(fixture.count("behaviors"), 0);
}

#[test]
fn an_empty_preview_can_bind_one_mode_without_accepting_plan_substitution() {
    let mut fixture = Fixture::new();
    let profile = fixture.profile.clone();
    let prepared = prepare_import(&mut fixture, Value::Null);
    let before_outbox = fixture.count("mutation_outbox");
    assert_eq!(
        fixture.run(apply_import_request(), 101).unwrap_err(),
        "The preview has no applicable write plan."
    );
    assert_eq!(fixture.count("mutation_outbox"), before_outbox);
    let bound=fixture.run(json!({"operation":"prepareBehaviorLogImport","expectedRevision":prepared["revision"],"previewRun":prepared["previewRun"],"plan":import_plan(&profile)}),101).unwrap();
    assert_eq!(fixture.count("behaviors"), 0);
    let mut replacement = import_plan(&profile);
    replacement["graphWrites"][0]["graph"]["behavior"]["title"] = json!("Substituted title");
    assert!(fixture.run(json!({"operation":"prepareBehaviorLogImport","expectedRevision":bound["revision"],"previewRun":bound["previewRun"],"plan":replacement}),102).is_err());
    assert_eq!(
        fixture.run(apply_import_request(), 103).unwrap()["status"],
        "applied"
    );
    assert_eq!(
        db::by_id::<Behavior>(&fixture.db, &profile, &id(1))
            .unwrap()
            .title,
        "Walk"
    );
}

#[test]
fn accepted_restore_deletion_records_history_tombstones_without_partial_changes() {
    let mut fixture = Fixture::new();
    fixture.create();
    fixture.occurrence();
    let profile = fixture.profile.clone();
    fixture
        .run(
            status_request(&profile, "unresolved", None, "completed", 20, NOW),
            102,
        )
        .unwrap();
    fixture
        .run(
            status_request(
                &profile,
                "completed",
                Some(20),
                "unresolved",
                21,
                "2026-08-30T12:01:00Z",
            ),
            103,
        )
        .unwrap();
    let occurrence: Occurrence = db::by_id(&fixture.db, &profile, &id(10)).unwrap();
    assert!(fixture
        .db
        .execute(
            "UPDATE occurrence_status_events SET previous_status=NULL WHERE id=?1",
            [id(21)]
        )
        .is_err());
    let mut preview = import_run(&profile, 60, "restore_preview");
    preview["dry_run_summary"]["archiveFingerprint"] = json!("d".repeat(64));
    preview["dry_run_summary"]["statusHistoryPolicy"] =
        json!({"selected":"preserve_append_only_history","applySupportedInThisTicket":true});
    preview["dry_run_summary"]["summary"] = json!({"unsupportedActionCount":0,"skippedCount":0});
    preview["dry_run_summary"]["actions"] =
        json!({"occurrences":[{"localId":id(10),"externalId":null,"action":"delete"}]});
    let mut plan = import_plan(&profile);
    plan["mode"] = json!("restore_apply");
    plan["applyRun"]["import_mode"] = json!("restore_apply");
    plan["graphWrites"] = json!([]);
    plan["definitionEvents"] = json!([]);
    plan["occurrenceWrites"] = json!([]);
    plan["occurrenceDeletes"] = json!([occurrence]);
    plan["mappings"] = json!([]);
    let revision = import::domain_revision(&fixture.db, &profile).unwrap();
    let mut unreviewed = preview.clone();
    unreviewed["dry_run_summary"]["actions"] = json!({});
    assert!(fixture.run(json!({"operation":"prepareBehaviorLogImport","expectedRevision":revision,"previewRun":unreviewed,"plan":plan}),104).is_err());
    fixture.run(json!({"operation":"prepareBehaviorLogImport","expectedRevision":revision,"previewRun":preview,"plan":plan}),104).unwrap();
    let mut apply = apply_import_request();
    apply["importMode"] = json!("restore_apply");
    apply["bundlePayloadFingerprint"] = json!("d".repeat(64));
    let result = fixture.run(apply, 105).unwrap();
    assert_eq!(result["status"], "applied", "{result}");
    assert_eq!(fixture.count("occurrences"), 0);
    assert_eq!(fixture.count("occurrence_status_events"), 0);
    assert_eq!(fixture.count("tombstones"), 3);
    assert_eq!(fixture.count("behaviors"), 1);
}

#[test]
fn reminder_reconciliation_and_sync_metadata_do_not_stale_import_preview() {
    let mut fixture = Fixture::new();
    let profile = fixture.profile.clone();
    let prepared = prepare_import(&mut fixture, import_plan(&profile));
    let global = reminder::revision(&fixture.db, &profile).unwrap();
    let intent=fixture.run(json!({"operation":"commitNativeReminderPlan","expectedRevision":global,"reminders":[],"cancelIds":[]}),101).unwrap();
    fixture.run(json!({"operation":"recordNativeReminderCoverage","expectedRevision":intent["revision"],"coverage":{"status":"complete","target_through":"2026-09-29T12:00:00Z","scheduled_through":"2026-09-29T12:00:00Z","first_unscheduled_at":null,"expected_count":0,"scheduled_count":0,"missing_ids":[],"reason":null,"verified_at":NOW},"observed":[]}),102).unwrap();
    let mut state = db::owned::<OccurrenceSyncState>(&fixture.db, &profile)
        .unwrap()
        .remove(0);
    state.stale = false;
    state.stale_reason = None;
    state.last_synced_local_date = Some("2026-08-30".into());
    state.synced_through_local_date = Some("2026-09-29".into());
    state.last_successful_sync_at = Some(NOW.into());
    fixture
        .run(
            json!({"operation":"commitSyncState","expectedVersion":0,"state":state}),
            103,
        )
        .unwrap();
    assert_eq!(
        import::domain_revision(&fixture.db, &profile).unwrap(),
        prepared["revision"]
    );
    assert_eq!(
        fixture.run(apply_import_request(), 104).unwrap()["status"],
        "applied"
    );
}
