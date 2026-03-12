-- ============================================================
-- api_custom_WalkinReg_CreateFamily
--
-- Creates a full walk-in family registration in a single transaction:
--   1. Household
--   2. Parent Contact (Head of Household)
--   3. Child Contacts (Minor Child) with Date_of_Birth
--   4. Participant records for each child (if not auto-created)
--   5. Group_Participants linking each child to their assigned Kids Quest group
--
-- Parameters:
--   @ParentFirstName  NVARCHAR(100)
--   @ParentLastName   NVARCHAR(100)
--   @ParentEmail      NVARCHAR(255)
--   @ParentPhone      NVARCHAR(50)
--   @CongregationID   INT           — optional; from ?locationId= URL param
--   @ChildrenJSON     NVARCHAR(MAX) — JSON array, e.g.:
--                     [{"firstName":"Billy","lastName":"Smith",
--                       "birthdate":"2019-04-10","groupId":53012}]
--   @UserName         NVARCHAR(255) — injected automatically by MP widget framework
--
-- Returns (DataSet1):
--   Household_ID INT, Success BIT, Message NVARCHAR(500)
--
-- Requires SQL Server 2016+ (OPENJSON)
-- ============================================================

CREATE PROCEDURE [dbo].[api_custom_WalkinReg_CreateFamily]
  @ParentFirstName  NVARCHAR(100),
  @ParentLastName   NVARCHAR(100),
  @ParentEmail      NVARCHAR(255),
  @ParentPhone      NVARCHAR(50),
  @CongregationID   INT           = NULL,
  @ChildrenJSON     NVARCHAR(MAX),
  @UserName         NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  BEGIN TRY
    BEGIN TRANSACTION;

    -- ── 1. Create Household ──────────────────────────────────────────────
    INSERT INTO Households (
      Household_Name,
      Congregation_ID,
      Domain_ID
    )
    VALUES (
      @ParentLastName,
      @CongregationID,
      1
    );

    DECLARE @HouseholdID INT = SCOPE_IDENTITY();

    -- ── 2. Create Parent Contact (Head of Household) ─────────────────────
    INSERT INTO Contacts (
      First_Name,
      Last_Name,
      Display_Name,
      Email_Address,
      Mobile_Phone,
      Household_ID,
      Household_Position_ID,  -- 1 = Head of Household
      Domain_ID
    )
    VALUES (
      @ParentFirstName,
      @ParentLastName,
      @ParentLastName + ', ' + @ParentFirstName,
      @ParentEmail,
      @ParentPhone,
      @HouseholdID,
      1,
      1
    );

    -- ── 3. Process each child from JSON ──────────────────────────────────
    DECLARE @ChildFirst   NVARCHAR(100);
    DECLARE @ChildLast    NVARCHAR(100);
    DECLARE @ChildDOB     DATE;
    DECLARE @GroupID      INT;
    DECLARE @ContactID    INT;
    DECLARE @ParticipantID INT;

    DECLARE child_cursor CURSOR FOR
      SELECT
        JSON_VALUE(value, '$.firstName'),
        JSON_VALUE(value, '$.lastName'),
        TRY_CAST(JSON_VALUE(value, '$.birthdate') AS DATE),
        TRY_CAST(JSON_VALUE(value, '$.groupId')   AS INT)
      FROM OPENJSON(@ChildrenJSON);

    OPEN child_cursor;
    FETCH NEXT FROM child_cursor INTO @ChildFirst, @ChildLast, @ChildDOB, @GroupID;

    WHILE @@FETCH_STATUS = 0
    BEGIN

      -- Create child Contact (Minor Child)
      INSERT INTO Contacts (
        First_Name,
        Last_Name,
        Display_Name,
        Date_of_Birth,
        Household_ID,
        Household_Position_ID,  -- 2 = Minor Child
        Domain_ID
      )
      VALUES (
        @ChildFirst,
        @ChildLast,
        @ChildLast + ', ' + @ChildFirst,
        @ChildDOB,
        @HouseholdID,
        2,
        1
      );

      SET @ContactID = SCOPE_IDENTITY();
      SET @ParticipantID = NULL;

      -- Check whether MP auto-created a Participant for this Contact
      SELECT @ParticipantID = Participant_ID
      FROM Participants
      WHERE Contact_ID = @ContactID;

      -- Create Participant if not auto-created
      IF @ParticipantID IS NULL
      BEGIN
        INSERT INTO Participants (
          Contact_ID,
          Participant_Type_ID,  -- 4 = Participant (confirm with your MP admin)
          Domain_ID
        )
        VALUES (@ContactID, 4, 1);

        SET @ParticipantID = SCOPE_IDENTITY();
      END

      -- Add child to their selected Kids Quest group
      IF @GroupID IS NOT NULL AND @GroupID > 0
      BEGIN
        INSERT INTO Group_Participants (
          Group_ID,
          Participant_ID,
          Group_Role_ID,  -- 16 = Member (confirm with your MP admin)
          Start_Date,
          Domain_ID
        )
        VALUES (
          @GroupID,
          @ParticipantID,
          16,
          GETDATE(),
          1
        );
      END

      FETCH NEXT FROM child_cursor INTO @ChildFirst, @ChildLast, @ChildDOB, @GroupID;
    END

    CLOSE child_cursor;
    DEALLOCATE child_cursor;

    COMMIT TRANSACTION;

    -- Return success
    SELECT
      @HouseholdID      AS Household_ID,
      CAST(1 AS BIT)    AS Success,
      'Family registered successfully' AS Message;

  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

    IF CURSOR_STATUS('local', 'child_cursor') >= 0
    BEGIN
      CLOSE child_cursor;
      DEALLOCATE child_cursor;
    END

    -- Return failure — the widget will show an error to the volunteer
    SELECT
      NULL             AS Household_ID,
      CAST(0 AS BIT)   AS Success,
      ERROR_MESSAGE()  AS Message;

  END CATCH

END
