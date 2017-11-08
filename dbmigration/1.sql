CREATE TABLE IF NOT EXISTS `warehouses` (
  `uuid` binary(16) NOT NULL,
  `name` varchar(50) CHARACTER SET ascii NOT NULL,
  `created` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `slots` (
  `uuid` binary(16) NOT NULL,
  `warehouseUuid` binary(16) NOT NULL,
  `name` varchar(50) CHARACTER SET ascii NOT NULL,
  `created` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`uuid`),
  UNIQUE KEY `warehouseUuid_name` (`warehouseUuid`,`name`),
  FOREIGN KEY (`warehouseUuid`) REFERENCES `warehouses` (`uuid`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `items` (
  `uuid` binary(16) NOT NULL,
  `article` varchar(256) CHARACTER SET ascii NOT NULL,
  `slotUuid` binary(16) NOT NULL,
  `created` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`uuid`),
  FOREIGN KEY (`slotUuid`) REFERENCES `slots` (`uuid`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
