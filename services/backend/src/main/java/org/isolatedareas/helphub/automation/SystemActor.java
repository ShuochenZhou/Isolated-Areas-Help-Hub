package org.isolatedareas.helphub.automation;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** Resolves the disabled system account introduced in V15 for automatic-decision audit records. */
@Component
public class SystemActor {
    private final JdbcClient jdbc;
    private volatile Long id;

    public SystemActor(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public long id() {
        Long cached = id;
        if (cached != null) return cached;
        long found = jdbc.sql("""
                SELECT MIN(id) FROM users
                WHERE display_name = '自动调度系统' AND role = 'OPERATOR' AND enabled = FALSE
                """).query(Long.class).single();
        id = found;
        return found;
    }
}
