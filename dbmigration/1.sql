CREATE TABLE IF NOT EXISTS `slots` (
  `uuid` binary(16) NOT NULL,
  `warehouseUuid` binary(16) NOT NULL,
  `name` varchar(50) CHARACTER SET ascii NOT NULL,
  `created` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`uuid`),
  UNIQUE KEY `warehouseUuid_name` (`warehouseUuid`,`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
