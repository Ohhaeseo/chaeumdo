FROM maven:3.9-eclipse-temurin-21-alpine AS build
WORKDIR /app
COPY pom.xml ./
RUN mvn -B dependency:go-offline
COPY src ./src
RUN mvn -B package -DskipTests

FROM eclipse-temurin:24-jre-alpine
RUN apk add --no-cache curl su-exec && addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh && mkdir -p /app/data/media && chown -R app:app /app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/actuator/health/readiness || exit 1
# The entrypoint runs as root to fix the photo volume's owner, then runs Java as the app user (su-exec).
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
