package kr.chaeummdo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class ChaeummdoApplication {

	public static void main(String[] args) {
		SpringApplication.run(ChaeummdoApplication.class, args);
	}

}
